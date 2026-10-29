# Agenda parser CloudWatch log

The handler emits one JSON log entry for each successful parse. Copy an actual invocation from `/aws/lambda/spry-agenda-parser` after deployment; the repository has no real AWS invocation, so it cannot provide measured token counts, latency, or cost.

The emitted shape is:

```json
{"event":"agenda_parsed","user":"<cognito-sub>","model":"<model-id>","prompt_version":"agenda-v1","input_tokens":0,"output_tokens":0,"latency_ms":0,"cost_usd":0.0}
```

`cost_usd` is computed by `backend/app/ai/costs.py` from the model and token usage. For the course's Claude Opus rates, calculate `input_tokens × 4 / 1,000,000 + output_tokens × 20 / 1,000,000`. The sample above is a schema illustration, not a recorded invocation.
