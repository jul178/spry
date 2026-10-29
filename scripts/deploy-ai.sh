#!/usr/bin/env bash
# Build and push the backend image with AI handler, then deploy the AI stack (infra/ai.yml).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${ROOT}/infra/ai.yml"
ENV_FILE="${ROOT}/.env"

log() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m==>\033[0m %s\n' "$*" >&2; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# Add standard Windows CLI locations to PATH if present
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
AI_STACK_NAME="${PROJECT_NAME}-ai"
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

# --- Deploy CloudFormation template ---
PARSER_MODEL="${PARSER_MODEL:-anthropic.claude-opus-5-5}"
COGNITO_USER_POOL_ID="${COGNITO_USER_POOL_ID:-}"
COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID:-}"
COGNITO_REGION="${COGNITO_REGION:-us-east-1}"
CORS_ORIGINS="${API_CORS_ORIGINS:-*}"

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
  {"ParameterKey": "ImageUri", "ParameterValue": "${IMAGE_URI}"},
  {"ParameterKey": "Architecture", "ParameterValue": "${CFN_ARCHITECTURE}"},
  {"ParameterKey": "ParserModel", "ParameterValue": "${PARSER_MODEL}"},
  {"ParameterKey": "CognitoUserPoolId", "ParameterValue": "${COGNITO_USER_POOL_ID}"},
  {"ParameterKey": "CognitoClientId", "ParameterValue": "${COGNITO_CLIENT_ID}"},
  {"ParameterKey": "CognitoRegion", "ParameterValue": "${COGNITO_REGION}"},
  {"ParameterKey": "CorsOrigins", "ParameterValue": "${CORS_ORIGINS}"}
]
EOF

log "deploying CloudFormation stack ${AI_STACK_NAME}"
aws cloudformation deploy \
  --template-file "${WIN_TEMPLATE}" \
  --stack-name "${AI_STACK_NAME}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "file://${WIN_PARAMS_FILE}" \
  --tags "PROJECT_NAME=${PROJECT_NAME}" \
  --no-fail-on-empty-changeset

PARSER_URL="$(aws cloudformation describe-stacks --stack-name "${AI_STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='AgendaParserUrl'].OutputValue" --output text)"

log "stack ${AI_STACK_NAME} deployed successfully"
log "Agenda Parser URL: ${PARSER_URL}"

# Update .env with the parser URL
if [[ -f "${ENV_FILE}" ]]; then
  if grep -q "NEXT_PUBLIC_AGENDA_PARSER_URL=" "${ENV_FILE}"; then
    sed -i "s|NEXT_PUBLIC_AGENDA_PARSER_URL=.*|NEXT_PUBLIC_AGENDA_PARSER_URL=${PARSER_URL}|" "${ENV_FILE}"
  else
    echo "NEXT_PUBLIC_AGENDA_PARSER_URL=${PARSER_URL}" >> "${ENV_FILE}"
  fi
  log "updated NEXT_PUBLIC_AGENDA_PARSER_URL in .env"
fi
