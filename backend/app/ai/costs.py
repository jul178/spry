"""Token usage pricing calculator for LLM models on Amazon Bedrock."""

PRICING_PER_MILLION = {
    "anthropic.claude-opus-5-5": (4.00, 20.00),
    "us.anthropic.claude-opus-5-5": (4.00, 20.00),
    "anthropic.claude-sonnet-5-5": (2.00, 10.00),
    "us.anthropic.claude-sonnet-5-5": (2.00, 10.00),
    "anthropic.claude-haiku-5-5": (0.10, 0.50),
    "us.anthropic.claude-haiku-5-5": (0.10, 0.50),
    "us.amazon.nova-micro-v1:0": (0.035, 0.14),
    "amazon.nova-micro-v1:0": (0.035, 0.14),
    "amazon.nova-lite-v1:0": (0.06, 0.24),
    "us.amazon.nova-lite-v1:0": (0.06, 0.24),
    "amazon.nova-pro-v1:0": (0.80, 3.20),
    "us.amazon.nova-pro-v1:0": (0.80, 3.20),
}


def cost_usd(model: str, usage: dict) -> float:
    """Calculate cost in USD given model ID and usage dict with input_tokens, output_tokens."""
    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    input_rate, output_rate = PRICING_PER_MILLION.get(
        model, (4.00, 20.00)  # default to Opus 5.5 pricing
    )
    cost = (input_tokens * input_rate + output_tokens * output_rate) / 1_000_000.0
    return round(cost, 6)
