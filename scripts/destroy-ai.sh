#!/usr/bin/env bash
# Delete the AI stack.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env"

if [[ -f "${ENV_FILE}" ]]; then
  preset="$(export -p)"
  set -a
  source "${ENV_FILE}"
  set +a
  eval "${preset}"
fi

for var in AWS_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN; do
  [[ -n "${!var:-}" ]] || unset "${var}"
done

PROJECT_NAME="${PROJECT_NAME:-spry}"
AI_STACK_NAME="${PROJECT_NAME}-ai"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "Deleting CloudFormation stack ${AI_STACK_NAME} in ${AWS_REGION}..."
aws cloudformation delete-stack --stack-name "${AI_STACK_NAME}" --region "${AWS_REGION}"
aws cloudformation wait stack-delete-complete --stack-name "${AI_STACK_NAME}" --region "${AWS_REGION}"
echo "Stack ${AI_STACK_NAME} deleted."
