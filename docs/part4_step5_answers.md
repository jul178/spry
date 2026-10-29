# Part 4 — Step 5 answers

## Which inputs went wrong, and what would fix them?

This repository has not been run against the deployed Bedrock parser, so there is no measured result to identify as a model failure. Record each failure in `agenda_test_table.md`. A schema or validation change is appropriate for invalid types and out-of-range numbers; prompt changes are appropriate when the model consistently misreads valid text; UI changes are appropriate when the suggestion is hard to inspect or correct. Relative dates without enough information should remain empty rather than being guessed.

## What did input 5 do, and what limits the damage?

Input 5 tries to override extraction instructions and assign a fabricated owner. The system prompt says pasted text is data, and owners are copied from the source. Even if the model returns a wrong suggestion, it cannot write to Spry: the user must review it and the save goes through the authenticated API endpoint.

## What does one parse cost, and what would 20 organisations pay monthly?

Use the invocation's `cost_usd`. At 30 agendas per week for each of 20 organisations, the volume is `20 × 30 × 52 / 12 = 2,600` parses per average month. Monthly model cost is `2,600 × measured cost per parse`; compare that amount with the course's `$7.30/month` interface endpoint estimate. The result varies by model and input length. There is no real measured parse cost in this repository yet.

## How would you measure whether agenda-v2 is better than agenda-v1?

Use the saved `ai_suggestion` values to build a reviewed reference set. Run both prompt versions on the same inputs and compare field-level exact match for dates, durations, owners, topics, and action items, plus invented-value and no-agenda false-positive rates. Keep the model, prompt version, and input alongside each result, and have a person label the correct output before comparing versions.
