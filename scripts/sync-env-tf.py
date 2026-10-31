#!/usr/bin/env python3
"""Sync outputs from Terraform (infra/) into the root .env file."""

import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INFRA_DIR = os.path.join(ROOT, "infra")
ENV_PATH = os.path.join(ROOT, ".env")


def get_terraform_outputs() -> dict[str, str]:
    try:
        proc = subprocess.run(
            ["terraform", f"-chdir={INFRA_DIR}", "output", "-json"],
            capture_output=True,
            text=True,
            check=True,
        )
        data = json.loads(proc.stdout)
        return {k: str(v["value"]) for k, v in data.items() if "value" in v}
    except Exception as exc:
        print(f"Warning: could not read terraform output: {exc}", file=sys.stderr)
        return {}


def update_env(updates: dict[str, str]) -> None:
    if not os.path.exists(ENV_PATH):
        print(f"Error: {ENV_PATH} does not exist", file=sys.stderr)
        return

    with open(ENV_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.splitlines()

    for key, val in updates.items():
        pattern = re.compile(rf"^{re.escape(key)}=.*$")
        replaced = False
        for i, line in enumerate(lines):
            if pattern.match(line):
                lines[i] = f"{key}={val}"
                replaced = True
                break
        if not replaced:
            lines.append(f"{key}={val}")

    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"Updated .env with {len(updates)} values from Terraform.")


def main() -> None:
    outputs = get_terraform_outputs()
    if not outputs:
        print("No outputs received from Terraform. Exiting.")
        return

    mapping = {}
    if "user_pool_id" in outputs:
        mapping["COGNITO_USER_POOL_ID"] = outputs["user_pool_id"]
    if "client_id" in outputs:
        mapping["COGNITO_CLIENT_ID"] = outputs["client_id"]
    if "cognito_domain" in outputs:
        mapping["COGNITO_DOMAIN"] = outputs["cognito_domain"]
    if "agenda_parser_url" in outputs:
        mapping["NEXT_PUBLIC_AGENDA_PARSER_URL"] = outputs["agenda_parser_url"]
    if "google_configured" in outputs:
        mapping["COGNITO_GOOGLE_ENABLED"] = outputs["google_configured"].lower()

    if mapping:
        update_env(mapping)
    else:
        print("No matching Spry outputs found in Terraform state.")


if __name__ == "__main__":
    main()
