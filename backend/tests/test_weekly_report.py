import csv
import io
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meeting import Meeting
from app.reports.weekly import build_weekly_report_async, parse_iso_week


def test_parse_iso_week():
    year, week = parse_iso_week("2026-W40")
    assert year == 2026
    assert week == 40

    year, week = parse_iso_week("2026-W01")
    assert year == 2026
    assert week == 1

    with pytest.raises(ValueError):
        parse_iso_week("invalid-week")

    with pytest.raises(ValueError):
        parse_iso_week("2026-W55")


@pytest.mark.asyncio
async def test_build_weekly_report_with_meetings(session: AsyncSession):
    # Week 40 of 2026 starts on Monday 2026-09-28 and ends on Sunday 2026-10-04.
    # Week 39 of 2026 starts on Monday 2026-09-21 and ends on Sunday 2026-09-27.

    # Previous week meeting
    prev_meeting = Meeting(
        title="W39 Sprint Planning",
        category="planning",
        start_time=datetime(2026, 9, 23, 10, 0, tzinfo=UTC),
        duration_minutes=60,
        attendee_count=4,
        hourly_rate_usd=65.0,
        estimated_cost_usd=260.0,
    )

    # Current week meetings
    m1 = Meeting(
        title="W40 Daily Standup",
        category="standup",
        start_time=datetime(2026, 9, 29, 9, 0, tzinfo=UTC),
        duration_minutes=15,
        attendee_count=5,
        hourly_rate_usd=65.0,
        estimated_cost_usd=81.25,
    )
    m2 = Meeting(
        title="W40 Architecture Review",
        category="sync",
        start_time=datetime(2026, 9, 30, 14, 0, tzinfo=UTC),
        duration_minutes=90,
        attendee_count=3,
        hourly_rate_usd=65.0,
        estimated_cost_usd=292.5,
    )
    m3 = Meeting(
        title="W40 1:1 Sync",
        category="one_on_one",
        start_time=datetime(2026, 10, 1, 11, 0, tzinfo=UTC),
        duration_minutes=45,
        attendee_count=2,
        hourly_rate_usd=65.0,
        estimated_cost_usd=97.5,
    )

    session.add_all([prev_meeting, m1, m2, m3])
    await session.flush()

    csv_bytes = await build_weekly_report_async("2026-W40", session=session)
    assert isinstance(csv_bytes, bytes)
    content = csv_bytes.decode("utf-8")

    # Verify CSV structure
    reader = list(csv.reader(io.StringIO(content)))
    assert any("SPRY WEEKLY MEETINGS REPORT" in row for row in reader)
    assert any("2026-W40" in row for row in reader)

    # Verify metrics
    # Current week: 3 meetings, 150 minutes (2.50 hours), $471.25 cost
    # Previous week: 1 meeting, 60 minutes (1.00 hours), $260.00 cost
    lines = [",".join(row) for row in reader]
    assert any("Total Meetings,3,1,+2" in line for line in lines)
    assert any("Total Duration (hours),2.50,1.00,+1.50" in line for line in lines)
    assert any("W40 Architecture Review" in line for line in lines)


def test_lambda_handler_extract_payload():
    from app.reports.lambda_handler import extract_payload

    # Direct invoke
    payload, trigger = extract_payload({"source": "schedule", "week": "2026-W40"})
    assert trigger == "schedule"
    assert payload["week"] == "2026-W40"

    # SQS record from schedule
    sqs_event_sched = {
        "Records": [
            {
                "eventSource": "aws:sqs",
                "body": '{"week": null, "source": "schedule"}',
            }
        ]
    }
    payload, trigger = extract_payload(sqs_event_sched)
    assert trigger == "schedule"
    assert payload["week"] is None

    # SQS record from make report-now
    sqs_event_user = {
        "Records": [
            {
                "eventSource": "aws:sqs",
                "body": '{"week": "2026-W39", "source": "sqs"}',
            }
        ]
    }
    payload, trigger = extract_payload(sqs_event_user)
    assert trigger == "sqs"
    assert payload["week"] == "2026-W39"


def test_lambda_handler_execution(monkeypatch):
    from unittest.mock import MagicMock

    from app.reports import lambda_handler

    mock_s3 = MagicMock()
    monkeypatch.setattr(lambda_handler.boto3, "client", lambda *args, **kwargs: mock_s3)
    monkeypatch.setenv("REPORTS_BUCKET", "test-reports-bucket")
    monkeypatch.setattr(lambda_handler, "build_weekly_report", lambda week: b"CSV-DATA")

    # Direct schedule event
    res = lambda_handler.handler({"source": "schedule", "week": "2026-W40"})
    assert res["statusCode"] == 200
    assert res["trigger"] == "schedule"
    assert res["week"] == "2026-W40"
    mock_s3.put_object.assert_called_with(
        Bucket="test-reports-bucket",
        Key="reports/2026-W40.csv",
        Body=b"CSV-DATA",
        ContentType="text/csv",
    )

    # SQS event
    res = lambda_handler.handler(
        {
            "Records": [
                {
                    "eventSource": "aws:sqs",
                    "body": '{"week": "2026-W39", "source": "sqs"}',
                }
            ]
        }
    )
    assert res["statusCode"] == 200
    assert res["trigger"] == "sqs"
    assert res["week"] == "2026-W39"


def test_mailer_execution(monkeypatch):
    from io import BytesIO
    from unittest.mock import MagicMock

    from app.reports import mailer

    mock_s3 = MagicMock()
    mock_ses = MagicMock()
    mock_s3.get_object.return_value = {"Body": BytesIO(b"CSV-REPORT-DATA")}
    mock_ses.send_email.return_value = {"MessageId": "msg-12345"}

    monkeypatch.setattr(mailer, "s3", mock_s3)
    monkeypatch.setattr(mailer, "ses", mock_ses)
    monkeypatch.setenv("SENDER_EMAIL", "sender@example.com")
    monkeypatch.setenv("RECIPIENT_EMAIL", "recipient@example.com")

    event = {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": "spry-reports-132568187649"},
                    "object": {"key": "reports/2026-W40.csv"},
                }
            }
        ]
    }
    res = mailer.handler(event)
    assert res["statusCode"] == 200
    assert res["status"] == "sent"
    mock_s3.get_object.assert_called_with(
        Bucket="spry-reports-132568187649",
        Key="reports/2026-W40.csv",
    )
    mock_ses.send_email.assert_called_once()
    call_args = mock_ses.send_email.call_args[1]
    raw_data = call_args["Content"]["Raw"]["Data"]
    assert b"Spry Weekly Meetings Report - 2026-W40" in raw_data
    assert b"2026-W40.csv" in raw_data
    # Attachment content in MIME EmailMessage is base64 encoded
    import base64

    assert base64.b64encode(b"CSV-REPORT-DATA") in raw_data
