"""AWS Lambda handler for agenda parsing."""

from datetime import date
import json
import logging
import os
import time
from typing import Any

import jwt
from jwt import PyJWKClient, PyJWKSet

from app.ai.agenda import PROMPT_VERSION, AgendaParseError, parse_agenda
from app.ai.costs import cost_usd
from app.config import get_settings

logging.basicConfig(level=logging.INFO, force=True)
log = logging.getLogger("spry.agenda_parser")
log.setLevel(logging.INFO)


class AuthUser:
    def __init__(self, payload: dict[str, Any]):
        self.payload = payload
        self.sub = payload.get("sub", "unknown")
        self.username = payload.get("cognito:username") or payload.get("email") or self.sub


def verify_cognito_token(auth_header: str) -> AuthUser:
    """Verify Cognito JWT token and return AuthUser. Gracefully falls back to demo user."""
    settings = get_settings()

    if not auth_header:
        return AuthUser({"sub": "demo-user", "cognito:username": "demo-user"})

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return AuthUser({"sub": "demo-user", "cognito:username": "demo-user"})

    token = parts[1]

    if token == "dev-mock-token" or token.startswith("dev-"):
        return AuthUser({"sub": "dev-user", "cognito:username": "dev-user"})

    if not settings.cognito_user_pool_id or not settings.cognito_client_id:
        return AuthUser({"sub": "dev-user", "cognito:username": "dev-user"})

    try:
        if settings.cognito_jwks:
            jwks_dict = json.loads(settings.cognito_jwks)
            jwk_set = PyJWKSet.from_dict(jwks_dict)
            unverified_header = jwt.get_unverified_header(token)
            key = jwk_set[unverified_header["kid"]]
            signing_key = key.key
        else:
            jwks_url = f"{settings.cognito_issuer}/.well-known/jwks.json"
            jwk_client = PyJWKClient(jwks_url)
            signing_key = jwk_client.get_signing_key_from_jwt(token).key

        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            issuer=settings.cognito_issuer,
            options={"verify_exp": True, "verify_iss": True},
        )

        if payload.get("token_use") != "access":
            log.warning("JWT token_use was not access, falling back to demo user")
            return AuthUser({"sub": "demo-user", "cognito:username": "demo-user"})

        token_client_id = payload.get("client_id") or payload.get("aud")
        if token_client_id != settings.cognito_client_id:
            log.warning("JWT client_id mismatch, falling back to demo user")
            return AuthUser({"sub": "demo-user", "cognito:username": "demo-user"})

        return AuthUser(payload)
    except Exception as exc:
        log.warning("JWT verification error, falling back to demo user: %s", exc)
        return AuthUser({"sub": "demo-user", "cognito:username": "demo-user"})


def _resp(status_code: int, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "*",
        },
        "body": json.dumps(data),
    }


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Lambda function URL handler for parsing agendas."""
    # Handle preflight OPTIONS request if passed through
    method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod")
        or "POST"
    )
    if method == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": {
                "access-control-allow-origin": "*",
                "access-control-allow-methods": "POST, OPTIONS",
                "access-control-allow-headers": "*",
            },
            "body": "",
        }

    headers = event.get("headers") or {}
    auth_header = headers.get("authorization") or headers.get("Authorization") or ""
    user = verify_cognito_token(auth_header)

    raw_body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64

        raw_body = base64.b64decode(raw_body).decode("utf-8")

    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        return _resp(400, {"error": "Invalid JSON body"})

    if not isinstance(body, dict):
        return _resp(400, {"error": "JSON body must be an object"})

    text = body.get("text", "")
    if not isinstance(text, str):
        return _resp(400, {"error": "Pasted text must be a string"})
    if len(text) > 10_000:
        return _resp(413, {"error": "Pasted text exceeds maximum allowed length of 10,000 characters"})

    if not text.strip():
        return _resp(422, {"error": "Pasted text cannot be empty"})

    today_str = body.get("today")
    tz_str = body.get("tz") or "UTC"
    if today_str is not None and not isinstance(today_str, str):
        return _resp(400, {"error": "Today must be an ISO date string"})
    if not isinstance(tz_str, str):
        return _resp(400, {"error": "Time zone must be a string"})
    try:
        today = date.fromisoformat(today_str) if today_str else date.today()
    except ValueError:
        return _resp(400, {"error": f"Invalid today date format: '{today_str}'"})

    settings = get_settings()
    started = time.monotonic()

    try:
        agenda, usage = parse_agenda(text, today, tz_str)
    except AgendaParseError as exc:
        log.warning("AgendaParseError: %s", exc)
        return _resp(422, {"error": str(exc)})
    except Exception as exc:
        provider_response = getattr(exc, "response", None)
        error_details = provider_response if isinstance(provider_response, dict) else {}
        provider_error = error_details.get("Error")
        error_code = (
            (provider_error.get("Code", "") if isinstance(provider_error, dict) else "")
            or getattr(exc, "code", "")
        )
        provider_status = getattr(exc, "status_code", None)
        if error_code in {"ThrottlingException", "TooManyRequestsException", "ServiceQuotaExceededException"} or provider_status == 429:
            status_code = 429
            message = "The agenda service is busy. Please try again shortly."
        elif (
            isinstance(exc, TimeoutError)
            or type(exc).__name__.lower().endswith("timeout")
            or provider_status == 504
        ):
            status_code = 504
            message = "The agenda service took too long to respond. Please try again."
        elif (
            (provider_status and provider_status >= 500)
            or type(exc).__name__ in {"APIConnectionError", "ConnectError", "ConnectionError"}
        ):
            status_code = 503
            message = "The agenda service is temporarily unavailable. You can enter the agenda by hand."
        else:
            status_code = 502
            message = "The agenda could not be parsed. Please try again or enter it by hand."
        log.error("Agenda parser provider error (%s): %s", error_code or type(exc).__name__, exc, exc_info=True)
        return _resp(status_code, {"error": message})

    latency_ms = int((time.monotonic() - started) * 1000)
    model_used = usage.get("model", settings.parser_model)
    cost = cost_usd(model_used, usage)

    log_entry = {
        "event": "agenda_parsed",
        "user": user.sub,
        "model": model_used,
        "prompt_version": PROMPT_VERSION,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "latency_ms": latency_ms,
        "cost_usd": cost,
    }
    print(json.dumps(log_entry), flush=True)
    log.info(json.dumps(log_entry))

    return _resp(
        200,
        {
            "agenda": agenda.model_dump(mode="json"),
            "model": model_used,
            "prompt_version": PROMPT_VERSION,
        },
    )
