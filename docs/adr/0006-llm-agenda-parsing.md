# ADR 0006: LLM agenda parsing

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

People receive meeting agendas in email, chat, and notes rather than in a fixed form. Spry should turn pasted text into a suggested structured agenda and let a person review it before saving. The input is untrusted external text, every model call has a cost, and the existing API and database run in a VPC with no NAT gateway.

## Decision

Use Claude on Amazon Bedrock, with `PARSER_MODEL` selecting the model and `agenda-v1` identifying the prompt. Run the stateless parser in a Lambda function outside the VPC. It needs only the pasted text and Bedrock, so it does not need database access or a VPC endpoint. Require a Cognito access token, cap input at 10,000 characters, and log the user identifier, model, prompt version, token counts, latency, and estimated cost.

The parser returns a schema-validated suggestion. A user reviews and edits it in the browser. Saving goes through the existing authenticated `POST /api/v1/meetings/{id}/agenda` endpoint. The model has no write tool and cannot update Spry's data.

## Alternatives considered

- **Call Bedrock from the VPC API:** rejected because it would require a Bedrock interface endpoint or NAT, adding monthly idle cost to an otherwise idle-friendly deployment.
- **Call the Claude API directly:** rejected because Bedrock keeps model access under AWS IAM and AWS billing and avoids a separate provider key.
- **Parse with regular expressions:** rejected because email, chat, multiple languages, relative dates, and varied agenda layouts are not reliably represented by one fixed pattern.

## Consequences

- The cost of a parse is calculated from the configured model's input and output token prices and recorded in CloudWatch. At the course's Opus rates, cost is `input_tokens × $4 / 1,000,000 + output_tokens × $20 / 1,000,000`; use the actual invocation log for the measured value.
- If Bedrock is unavailable or rejects the request, the UI offers a retry or manual entry. Meeting creation, listing, deletion, and the rest of Spry continue through the existing API.
- Agenda text is sent to Bedrock. Do not place confidential material in pasted text unless the organization permits that processing.
- Relative dates depend on the browser's supplied local date and time zone. Users review the result before saving.
