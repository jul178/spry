#!/usr/bin/env bash
# Build and push the backend image, then deploy the reports stack (infra/reports.yaml).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${ROOT}/infra/reports.yaml"
ENV_FILE="${ROOT}/.env"

log() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m==>\033[0m %s\n' "$*" >&2; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# Add standard Windows CLI locations to PATH if not yet present in Git Bash
for dir in "/c/Program Files/Amazon/AWSCLIV2" "/c/Program Files/nodejs" "/c/Users/Dell/AppData/Local/Programs/DockerDesktop/resources/bin"; do
  if [[ -d "${dir}" ]] && [[ ":${PATH}:" != *":${dir}:"* ]]; then
    export PATH="${dir}:${PATH}"
  fi
done

if [[ -f "${ENV_FILE}" ]]; then
  preset="$(export -p)"
  set -a
  # shellcheck disable=SC1091
  source "${ENV_FILE}"
  set +a
  eval "${preset}"
fi

for var in AWS_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN; do
  [[ -n "${!var:-}" ]] || unset "${var}"
done

PROJECT_NAME="${PROJECT_NAME:-spry}"
BACKEND_STACK_NAME="${PROJECT_NAME}-backend"
REPORTS_STACK_NAME="${PROJECT_NAME}-reports"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
export AWS_DEFAULT_REGION="${AWS_REGION}"

ECR_REPOSITORY="${ECR_REPOSITORY:-${PROJECT_NAME}-backend}"
LAMBDA_ARCHITECTURE="${LAMBDA_ARCHITECTURE:-arm64}"
case "${LAMBDA_ARCHITECTURE}" in
  arm64) CFN_ARCHITECTURE=arm64 ;;
  amd64) CFN_ARCHITECTURE=x86_64 ;;
  *) die "LAMBDA_ARCHITECTURE must be arm64 or amd64, got '${LAMBDA_ARCHITECTURE}'" ;;
esac

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" \
  || die "no usable AWS credentials"
log "account ${ACCOUNT_ID} in ${AWS_REGION}"

# --- image build and push ---
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
if [[ -z "${IMAGE_TAG:-}" || "${IMAGE_TAG}" == "latest" ]]; then
  if git -C "${ROOT}" rev-parse --git-dir >/dev/null 2>&1; then
    IMAGE_TAG="$(git -C "${ROOT}" rev-parse --short=12 HEAD)"
    git -C "${ROOT}" diff --quiet HEAD -- backend \
      || IMAGE_TAG="${IMAGE_TAG}-dirty-$(date -u +%Y%m%d%H%M%S)"
  else
    IMAGE_TAG="$(date -u +%Y%m%d%H%M%S)"
  fi
fi
IMAGE_URI="${REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"

log "building and pushing ${IMAGE_URI} for linux/${LAMBDA_ARCHITECTURE}"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${REGISTRY}" >/dev/null

docker buildx build \
  --platform "linux/${LAMBDA_ARCHITECTURE}" \
  --target lambda \
  --provenance=false \
  --sbom=false \
  --tag "${IMAGE_URI}" \
  --push \
  "${ROOT}/backend"

# --- fetch backend stack parameters ---
log "retrieving VPC and database settings from ${BACKEND_STACK_NAME}"
BACKEND_PARAMS="$(aws cloudformation describe-stacks --stack-name "${BACKEND_STACK_NAME}" \
  --query "Stacks[0].Parameters" --output json 2>/dev/null)" \
  || die "backend stack ${BACKEND_STACK_NAME} not found. Deploy it first with make deploy-backend"

VPC_ID="$(echo "${BACKEND_PARAMS}" | python3 -c 'import sys, json; p = json.load(sys.stdin); print(next(x["ParameterValue"] for x in p if x["ParameterKey"]=="VpcId"))')"
SUBNET_IDS="$(echo "${BACKEND_PARAMS}" | python3 -c 'import sys, json; p = json.load(sys.stdin); print(next(x["ParameterValue"] for x in p if x["ParameterKey"]=="SubnetIds"))')"

# Security Group for function
SG_ID="$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=${VPC_ID}" "Name=tag:Name,Values=${PROJECT_NAME}-backend-function" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || true)"
if [[ -z "${SG_ID}" || "${SG_ID}" == "None" ]]; then
  SG_ID="$(echo "${BACKEND_PARAMS}" | python3 -c 'import sys, json; p = json.load(sys.stdin); print(next(x["ParameterValue"] for x in p if x["ParameterKey"]=="SecurityGroupId"))')"
fi

# Route Tables for VPC
ROUTE_TABLE_IDS="$(aws ec2 describe-route-tables --filters "Name=vpc-id,Values=${VPC_ID}" \
  --query "RouteTables[*].RouteTableId" --output text 2>/dev/null | tr '\t' ',')"
[[ -n "${ROUTE_TABLE_IDS}" ]] || die "no route tables found in VPC ${VPC_ID}"

# Database URL from secret
SECRET_ARN="$(aws cloudformation describe-stacks --stack-name "${BACKEND_STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='DatabaseUrlSecretArn'].OutputValue" \
  --output text 2>/dev/null)"
[[ -n "${SECRET_ARN}" && "${SECRET_ARN}" != "None" ]] || die "DatabaseUrlSecretArn not found in ${BACKEND_STACK_NAME}"
DATABASE_URL="$(aws secretsmanager get-secret-value --secret-id "${SECRET_ARN}" --query SecretString --output text)"

SENDER_EMAIL="${SENDER_EMAIL:-juliadub2008@gmail.com}"
RECIPIENT_EMAIL="${RECIPIENT_EMAIL:-juliadub2008@gmail.com}"

PARAMS_FILE="$(mktemp)"
chmod 600 "${PARAMS_FILE}"
trap 'rm -f "${PARAMS_FILE}"' EXIT

WIN_PARAMS_FILE="${PARAMS_FILE}"
WIN_TEMPLATE="${TEMPLATE}"
if command -v cygpath >/dev/null 2>&1; then
  WIN_PARAMS_FILE="$(cygpath -m "${PARAMS_FILE}")"
  WIN_TEMPLATE="$(cygpath -m "${TEMPLATE}")"
fi

cat >"${PARAMS_FILE}" <<EOF
[
  {"ParameterKey": "ProjectName", "ParameterValue": "${PROJECT_NAME}"},
  {"ParameterKey": "VpcId", "ParameterValue": "${VPC_ID}"},
  {"ParameterKey": "SubnetIds", "ParameterValue": "${SUBNET_IDS}"},
  {"ParameterKey": "RouteTableIds", "ParameterValue": "${ROUTE_TABLE_IDS}"},
  {"ParameterKey": "SecurityGroupId", "ParameterValue": "${SG_ID}"},
  {"ParameterKey": "ImageUri", "ParameterValue": "${IMAGE_URI}"},
  {"ParameterKey": "Architecture", "ParameterValue": "${CFN_ARCHITECTURE}"},
  {"ParameterKey": "DatabaseUrl", "ParameterValue": "${DATABASE_URL}"},
  {"ParameterKey": "SenderEmail", "ParameterValue": "${SENDER_EMAIL}"},
  {"ParameterKey": "RecipientEmail", "ParameterValue": "${RECIPIENT_EMAIL}"},
  {"ParameterKey": "CreateEmailIdentity", "ParameterValue": "false"}
]
EOF

log "deploying CloudFormation stack ${REPORTS_STACK_NAME}"
aws cloudformation deploy \
  --template-file "${WIN_TEMPLATE}" \
  --stack-name "${REPORTS_STACK_NAME}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "file://${WIN_PARAMS_FILE}" \
  --tags "PROJECT_NAME=${PROJECT_NAME}" \
  --no-fail-on-empty-changeset

log "stack ${REPORTS_STACK_NAME} deployed successfully"
aws cloudformation describe-stacks --stack-name "${REPORTS_STACK_NAME}" \
  --query "Stacks[0].Outputs" --output table
