"""Tests for AI agenda parsing, costs, and endpoints."""

from datetime import date
import json
import uuid

import pytest
from httpx import AsyncClient

from app.ai.agenda import ActionItem, AgendaItem, ParsedAgenda
from app.ai.agenda_lambda import handler as lambda_handler
from app.ai.costs import cost_usd


def test_agenda_schema_validation():
    """Verify ParsedAgenda model validates and serializes properly."""
    data = {
        "title": "Pricing sync",
        "starts_at": "2026-11-02T10:00:00+02:00",
        "duration_minutes": 45,
        "items": [
            {"topic": "New Pro tiers", "owner": "Olena", "minutes": 15},
            {"topic": "Customer feedback", "owner": "Taras", "minutes": None},
        ],
        "action_items": [
            {"task": "Prepare competitor comparison", "owner": "Taras", "due": "2026-11-06"}
        ],
        "language": "en",
    }
    parsed = ParsedAgenda.model_validate(data)
    assert parsed.title == "Pricing sync"
    assert parsed.duration_minutes == 45
    assert len(parsed.items) == 2
    assert parsed.items[0].owner == "Olena"
    assert parsed.items[0].minutes == 15
    assert parsed.items[1].minutes is None
    assert len(parsed.action_items) == 1
    assert parsed.action_items[0].due == date(2026, 11, 6)


def test_cost_calculation():
    """Verify cost calculation for various Bedrock models."""
    opus_usage = {"input_tokens": 5500, "output_tokens": 300}
    # 5500 * $4/M + 300 * $20/M = 0.022 + 0.006 = 0.028
    assert cost_usd("anthropic.claude-opus-5-5", opus_usage) == 0.028

    haiku_usage = {"input_tokens": 5500, "output_tokens": 300}
    # 5500 * $0.10/M + 300 * $0.50/M = 0.00055 + 0.00015 = 0.0007
    assert cost_usd("anthropic.claude-haiku-5-5", haiku_usage) == 0.0007

    nova_usage = {"input_tokens": 1000, "output_tokens": 500}
    # 1000 * $0.06/M + 500 * $0.24/M = 0.00006 + 0.00012 = 0.00018
    assert cost_usd("amazon.nova-lite-v1:0", nova_usage) == 0.00018


def test_lambda_rejects_missing_auth():
    """Unauthenticated call to agenda parser Lambda returns 401."""
    event = {
        "headers": {},
        "body": json.dumps({"text": "Meeting tomorrow", "today": "2026-10-29", "tz": "UTC"}),
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 401


def test_lambda_rejects_oversized_text():
    """Text longer than 10,000 chars is rejected with 413."""
    oversized_text = "a" * 10_001
    event = {
        "headers": {"authorization": "Bearer dev-mock-token"},
        "body": json.dumps({"text": oversized_text, "today": "2026-10-29", "tz": "UTC"}),
    }
    # Set APP_ENV=development for dev-mock-token
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 413
    body = json.loads(resp["body"])
    assert "10,000 characters" in body["error"]


def test_lambda_rejects_empty_text():
    """Empty text is rejected with 422."""
    event = {
        "headers": {"authorization": "Bearer dev-mock-token"},
        "body": json.dumps({"text": "   ", "today": "2026-10-29", "tz": "UTC"}),
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 422


async def test_save_meeting_agenda_endpoint(client: AsyncClient):
    """POST /meetings/{id}/agenda saves agenda and ai_suggestion."""
    # First create a meeting
    created_resp = await client.post(
        "/api/v1/meetings",
        json={
            "title": "Pricing Sync",
            "category": "sync",
            "start_time": "2026-11-02T10:00:00Z",
            "duration_minutes": 45,
            "attendee_count": 3,
            "hourly_rate_usd": 75.0,
        },
    )
    assert created_resp.status_code == 201
    meeting = created_resp.json()
    meeting_id = meeting["id"]

    agenda_data = {
        "title": "Pricing sync",
        "starts_at": "2026-11-02T10:00:00+02:00",
        "duration_minutes": 45,
        "items": [{"topic": "New Pro rates", "owner": "Olena", "minutes": 15}],
        "action_items": [],
        "language": "uk",
    }
    ai_suggestion = {
        "model": "anthropic.claude-opus-5-5",
        "prompt_version": "agenda-v1",
        "agenda": agenda_data,
    }

    # Save the agenda
    save_resp = await client.post(
        f"/api/v1/meetings/{meeting_id}/agenda",
        json={"agenda": agenda_data, "ai_suggestion": ai_suggestion},
    )
    assert save_resp.status_code == 200
    updated = save_resp.json()
    assert updated["agenda"] == agenda_data
    assert updated["ai_suggestion"] == ai_suggestion

    # Verify 404 for non-existent meeting
    fake_id = str(uuid.uuid4())
    notFound = await client.post(
        f"/api/v1/meetings/{fake_id}/agenda",
        json={"agenda": agenda_data},
    )
    assert notFound.status_code == 404


async def test_parse_agenda_endpoint(client: AsyncClient):
    """POST /meetings/parse-agenda parses unstructured text into structured agenda."""
    uk_text = (
        "Пн 10:00, синк по прайсингу, 45 хв. "
        "1) нові тарифи Pro — Олена, 15 хв "
        "2) фідбек від клієнтів — Taras "
        "3) що робимо з річною знижкою. "
        "Taras до п'ятниці збирає порівняння з конкурентами."
    )
    resp = await client.post(
        "/api/v1/meetings/parse-agenda",
        json={"text": uk_text, "today": "2026-10-29", "tz": "UTC"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "agenda" in data
    assert "model" in data
    assert data["prompt_version"] == "agenda-v1"
    agenda = data["agenda"]
    assert agenda["duration_minutes"] == 45
    assert len(agenda["items"]) >= 2

    # Reject oversized
    big_text = "a" * 10001
    resp_big = await client.post(
        "/api/v1/meetings/parse-agenda",
        json={"text": big_text, "today": "2026-10-29", "tz": "UTC"},
    )
    assert resp_big.status_code == 413

    # Reject non-agenda
    resp_empty = await client.post(
        "/api/v1/meetings/parse-agenda",
        json={"text": "Shopping list: apples and oranges", "today": "2026-10-29", "tz": "UTC"},
    )
    assert resp_empty.status_code == 422
