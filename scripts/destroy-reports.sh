#!/usr/bin/env bash
# Empty the reports S3 bucket and delete the reports CloudFormation stack.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env"

log() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m==>\033[0m %s\n' "$*" >&2; }

if [[ -f "${ENV_FILE}" ]]; then
  preset="$(export -p)"
  set -a
  source "${ENV_FILE}"
  set +a
  eval "${preset}"
fi

PROJECT_NAME="${PROJECT_NAME:-spry}"
STACK_NAME="${PROJECT_NAME}-reports"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
export AWS_DEFAULT_REGION="${AWS_REGION}"

BUCKET_NAME="$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='ReportsBucketName'].OutputValue" \
  --output text 2>/dev/null || true)"

if [[ -n "${BUCKET_NAME}" && "${BUCKET_NAME}" != "None" ]]; then
  log "emptying s3://${BUCKET_NAME}"
  aws s3 rm "s3://${BUCKET_NAME}" --recursive 2>/dev/null || true
fi

log "deleting CloudFormation stack ${STACK_NAME}"
aws cloudformation delete-stack --stack-name "${STACK_NAME}"
log "waiting for stack deletion to complete"
aws cloudformation wait stack-delete-complete --stack-name "${STACK_NAME}"
log "stack ${STACK_NAME} deleted"
