#!/usr/bin/env bash
# Deploy or update the Cognito user pool stack (infra/auth.yaml).
#
# Creates the user pool, public web client, managed login branding v2,
# hosted prefix domain, and optionally registers Google as an OIDC identity provider.
# Writes COGNITO_* variables back to .env for the frontend and backend.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${ROOT}/infra/auth.yaml"
ENV_FILE="${ROOT}/.env"

WIN_TEMPLATE="${TEMPLATE}"
if command -v cygpath >/dev/null 2>&1; then
  WIN_TEMPLATE="$(cygpath -m "${TEMPLATE}")"
fi

log() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m==>\033[0m %s\n' "$*" >&2; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# --- configuration ----------------------------------------------------------

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
STACK_NAME="${AUTH_STACK_NAME:-${PROJECT_NAME}-auth}"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
export AWS_DEFAULT_REGION="${AWS_REGION}"

# --- helpers ----------------------------------------------------------------

env_set() {
  KEY="$1" VALUE="$2" ENV_FILE="${ENV_FILE}" python3 - <<'PY'
import os, re

key, value, path = os.environ["KEY"], os.environ["VALUE"], os.environ["ENV_FILE"]
lines = open(path).read().splitlines() if os.path.exists(path) else []
pattern = re.compile(rf"^{re.escape(key)}=")

for i, line in enumerate(lines):
    if pattern.match(line):
        lines[i] = f"{key}={value}"
        break
else:
    lines.append(f"{key}={value}")

open(path, "w").write("\n".join(lines) + "\n")
PY
  log "wrote ${1}=${2} to .env"
}

# --- preflight --------------------------------------------------------------

for dir in "/c/Program Files/Amazon/AWSCLIV2" "/c/Program Files/nodejs"; do
  if [[ -d "${dir}" ]] && [[ ":${PATH}:" != *":${dir}:"* ]]; then
    export PATH="${dir}:${PATH}"
  fi
done

for tool in aws python3; do
  command -v "${tool}" >/dev/null 2>&1 || die "${tool} is required but not installed"
done

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" \
  || die "no usable AWS credentials - set AWS_PROFILE or AWS_* keys in .env"

# Frontend URL discovery
FRONTEND_STACK="${FRONTEND_STACK_NAME:-${PROJECT_NAME}-frontend}"
FRONTEND_URL="${FRONTEND_URL:-}"
if [[ -z "${FRONTEND_URL}" ]]; then
  FRONTEND_URL="$(aws cloudformation describe-stacks --stack-name "${FRONTEND_STACK}" \
    --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text 2>/dev/null || true)"
fi
if [[ -z "${FRONTEND_URL}" || "${FRONTEND_URL}" == "None" ]]; then
  FRONTEND_URL="http://localhost:3000"
  warn "frontend stack not found; defaulting FrontendUrl to ${FRONTEND_URL}"
else
  log "found deployed frontend at ${FRONTEND_URL}"
fi

# Cognito domain prefix: must be globally unique in the region
COGNITO_DOMAIN_PREFIX="${COGNITO_DOMAIN_PREFIX:-${PROJECT_NAME}-auth-${ACCOUNT_ID}}"

GOOGLE_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_SECRET="${GOOGLE_CLIENT_SECRET:-}"

if [[ -n "${GOOGLE_ID}" && -n "${GOOGLE_SECRET}" ]]; then
  log "Google OAuth credentials provided - configuring Google IdP"
else
  warn "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET empty in .env - deploying email/password only"
fi

# --- deploy -----------------------------------------------------------------

STATUS="$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].StackStatus" --output text 2>/dev/null || true)"
if [[ "${STATUS}" == "ROLLBACK_COMPLETE" ]]; then
  log "cleaning up failed stack in ROLLBACK_COMPLETE before deploy"
  aws cloudformation delete-stack --stack-name "${STACK_NAME}"
  aws cloudformation wait stack-delete-complete --stack-name "${STACK_NAME}"
fi

if ! aws cloudformation describe-stacks --stack-name "${STACK_NAME}" >/dev/null 2>&1; then
  log "first deploy - creating ${STACK_NAME}"
else
  log "updating ${STACK_NAME}"
fi

# Parameters file to protect secret from process table
PARAMS_FILE="$(mktemp)"
chmod 600 "${PARAMS_FILE}"
trap 'rm -f "${PARAMS_FILE}"' EXIT

WIN_PARAMS_FILE="${PARAMS_FILE}"
if command -v cygpath >/dev/null 2>&1; then
  WIN_PARAMS_FILE="$(cygpath -m "${PARAMS_FILE}")"
fi

cat <<EOF >"${PARAMS_FILE}"
[
  {"ParameterKey": "ProjectName", "ParameterValue": "${PROJECT_NAME}"},
  {"ParameterKey": "CognitoDomainPrefix", "ParameterValue": "${COGNITO_DOMAIN_PREFIX}"},
  {"ParameterKey": "FrontendUrl", "ParameterValue": "${FRONTEND_URL}"},
  {"ParameterKey": "LocalPort", "ParameterValue": "3000"},
  {"ParameterKey": "GoogleClientId", "ParameterValue": "${GOOGLE_ID}"},
  {"ParameterKey": "GoogleClientSecret", "ParameterValue": "${GOOGLE_SECRET}"}
]
EOF

if ! aws cloudformation deploy \
  --stack-name "${STACK_NAME}" \
  --template-file "${WIN_TEMPLATE}" \
  --parameter-overrides "file://${WIN_PARAMS_FILE}" \
  --no-fail-on-empty-changeset \
  --tags "PROJECT_NAME=${PROJECT_NAME}"; then
  warn "deploy failed - most recent failure reasons:"
  aws cloudformation describe-stack-events --stack-name "${STACK_NAME}" \
    --max-items 30 \
    --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`||ResourceStatus==`UPDATE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
    --output table >&2 || true
  exit 1
fi

outputs() {
  aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

USER_POOL_ID="$(outputs UserPoolId)"
CLIENT_ID="$(outputs ClientId)"
COGNITO_DOMAIN="$(outputs CognitoDomain)"
GOOGLE_CONFIGURED="$(outputs GoogleConfigured)"
GOOGLE_REDIRECT_URI="$(outputs GoogleRedirectUri)"
GOOGLE_JS_ORIGIN="$(outputs GoogleJavascriptOrigin)"

# --- write to .env ----------------------------------------------------------

env_set COGNITO_REGION "${AWS_REGION}"
env_set COGNITO_USER_POOL_ID "${USER_POOL_ID}"
env_set COGNITO_CLIENT_ID "${CLIENT_ID}"
env_set COGNITO_DOMAIN "${COGNITO_DOMAIN}"
env_set COGNITO_GOOGLE_ENABLED "${GOOGLE_CONFIGURED}"

echo
echo "================================================================================"
echo "  Cognito User Pool Deployed Successfully"
echo "================================================================================"
echo "  User Pool ID:         ${USER_POOL_ID}"
echo "  Client ID:            ${CLIENT_ID}"
echo "  Cognito Domain:       ${COGNITO_DOMAIN}"
echo "  Google Enabled:       ${GOOGLE_CONFIGURED}"
echo
echo "  --- Google OAuth Settings (Set in Google Cloud Console) ---"
echo "  Authorised JavaScript origin:"
echo "    ${GOOGLE_JS_ORIGIN}"
echo "  Authorised redirect URI:"
echo "    ${GOOGLE_REDIRECT_URI}"
echo "================================================================================"
echo
echo "Next steps:"
echo "1. If Google sign-in is not yet enabled, set up your OAuth Client ID in Google Cloud"
echo "   Console using the URIs above, add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env,"
echo "   and rerun: make deploy-cognito"
echo "2. Rebuild and deploy the frontend: make deploy-frontend"
echo "3. Redeploy the backend to sync JWKS signing keys: make deploy-backend"
echo
