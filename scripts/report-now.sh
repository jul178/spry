#!/usr/bin/env bash
# Send an on-demand weekly report request message to the SQS queue.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env"

log() { printf '\033[36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# Add standard Windows CLI locations to PATH if not yet present in Git Bash
for dir in "/c/Program Files/Amazon/AWSCLIV2" "/c/Program Files/nodejs"; do
  if [[ -d "${dir}" ]] && [[ ":${PATH}:" != *":${dir}:"* ]]; then
    export PATH="${dir}:${PATH}"
  fi
done

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
STACK_NAME="${PROJECT_NAME}-reports"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
export AWS_DEFAULT_REGION="${AWS_REGION}"

TARGET_WEEK="${1:-${WEEK:-}}"
if [[ -z "${TARGET_WEEK}" ]]; then
  TARGET_WEEK="$(python3 -c '
import datetime
today = datetime.datetime.now(datetime.timezone.utc).date()
prev = today - datetime.timedelta(days=7)
y, w, _ = prev.isocalendar()
print(f"{y}-W{w:02d}")
')"
fi

QUEUE_URL="$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='ReportRequestsQueueUrl'].OutputValue" \
  --output text 2>/dev/null || true)"

if [[ -z "${QUEUE_URL}" || "${QUEUE_URL}" == "None" ]]; then
  QUEUE_URL="$(aws sqs get-queue-url --queue-name "${PROJECT_NAME}-report-requests" --query 'QueueUrl' --output text 2>/dev/null)" \
    || die "could not find queue for ${PROJECT_NAME}-report-requests. Is the reports stack deployed?"
fi

PAYLOAD="{\"week\": \"${TARGET_WEEK}\", \"source\": \"sqs\"}"
log "sending message to ${QUEUE_URL}: ${PAYLOAD}"

MSG_ID="$(aws sqs send-message \
  --queue-url "${QUEUE_URL}" \
  --message-body "${PAYLOAD}" \
  --query "MessageId" \
  --output text)"

log "message sent successfully (MessageId: ${MSG_ID})"
log "builder Lambda will process the message and upload report to S3, triggering the mailer"
