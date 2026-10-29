"""Run the Bedrock Anthropic Messages API snippet from Part 1."""

import os
import sys

from anthropic import AnthropicBedrockMantle, PermissionDeniedError
import boto3

model = os.getenv("PARSER_MODEL", "anthropic.claude-opus-5-5")
region = os.getenv("AWS_REGION", "us-east-1")

print(f"Calling Bedrock model '{model}' in {region}...")

try:
    client = AnthropicBedrockMantle(aws_region=region)
    msg = client.messages.create(
        model=model,
        max_tokens=1024,
        output_config={"effort": "low"},
        messages=[{"role": "user", "content": "In one sentence: what is an ISO week?"}],
    )
    text = next(b.text for b in msg.content if b.type == "text")
    print("\n[Anthropic Bedrock Mantle Response]")
    print(text)
    print(f"stop_reason: {msg.stop_reason}, input_tokens: {msg.usage.input_tokens}, output_tokens: {msg.usage.output_tokens}")
except PermissionDeniedError as exc:
    print(f"\nAnthropic model '{model}' permission error (approval pending in Bedrock): {exc}")
    print("\nDemonstrating Bedrock Converse API with Amazon Nova Micro (Part 1 snippet 2):")
    brt = boto3.client("bedrock-runtime", region_name=region)
    resp = brt.converse(
        modelId="us.amazon.nova-micro-v1:0",
        messages=[{"role": "user", "content": [{"text": "In one sentence: what is an ISO week?"}]}],
        inferenceConfig={"maxTokens": 200},
    )
    ans = resp["output"]["message"]["content"][0]["text"]
    print(ans)
    print(resp["usage"])
except Exception as exc:
    print(f"Error calling {model}: {exc}")
    sys.exit(1)
