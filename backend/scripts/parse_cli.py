"""CLI to test parse_agenda."""

from datetime import date
import json
import os
import sys

from app.ai.agenda import parse_agenda
from app.ai.costs import cost_usd

default_text = (
    "Пн 10:00, синк по прайсингу, 45 хв. 1) нові тарифи Pro — Олена, 15 хв "
    "2) фідбек від клієнтів — Taras 3) що робимо з річною знижкою. "
    "Taras до п'ятниці збирає порівняння з конкурентами."
)

text = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else default_text
model_override = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None

today = date.today()
tz = "Europe/Kyiv"

print(f"Parsing agenda (today={today}, tz={tz})...\nInput text:\n{text}\n")

agenda, usage = parse_agenda(text, today, tz, model=model_override)

model_used = usage.get("model", "unknown")
cost = cost_usd(model_used, usage)

print("--- Parsed Agenda (JSON) ---")
print(json.dumps(agenda.model_dump(mode="json"), indent=2, ensure_ascii=False))
print("\n--- Usage & Cost ---")
print(f"Model used: {model_used}")
print(f"Tokens in:  {usage.get('input_tokens', 0)}")
print(f"Tokens out: {usage.get('output_tokens', 0)}")
print(f"Cost:       ${cost:.6f}")
