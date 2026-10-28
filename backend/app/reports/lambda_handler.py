"""AWS Lambda entry point for Spry report builder.

Invoked in the VPC (with route to S3 via VPC gateway endpoint).
Handles direct schedule invocations and SQS record invocations.
"""

import json
import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import boto3

from app.reports.weekly import build_weekly_report

# Configure logger
logger = logging.getLogger("report_builder")
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())
if not logger.handlers:
    handler_stdout = logging.StreamHandler()
    formatter = logging.Formatter(
        "[%(asctime)s] %(levelname)s [%(name)s] %(message)s"
    )
    handler_stdout.setFormatter(formatter)
    logger.addHandler(handler_stdout)


def get_previous_iso_week() -> str:
    """Return the previous ISO week string, e.g. '2026-W40'."""
    today = datetime.now(UTC).date()
    last_week_day = today - timedelta(days=7)
    iso_year, iso_week, _ = last_week_day.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def extract_payload(event: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Extract payload dictionary and detect invocation trigger."""
    if "Records" in event and event["Records"]:
        record = event["Records"][0]
        if record.get("eventSource") == "aws:sqs" or "body" in record:
            raw_body = record.get("body", "{}")
            try:
                payload = json.loads(raw_body)
            except Exception:
                payload = {"raw": raw_body}

            source = payload.get("source") if isinstance(payload, dict) else None
            trigger = source if source else "sqs"
            return payload if isinstance(payload, dict) else {}, trigger

    # Direct invocation (e.g. EventBridge Scheduler or CLI direct invoke)
    payload = event
    trigger = event.get("source", "schedule")
    return payload, trigger


def handler(event: dict[str, Any], context: Any = None) -> dict[str, Any]:
    """Report builder handler."""
    payload, trigger = extract_payload(event)

    week = payload.get("week")
    if not week:
        week = get_previous_iso_week()

    # Step 3 requirement: log the event at the start of every handler
    logger.info(
        f"report-builder triggered: trigger={trigger}, week={week}",
        extra={"trigger": trigger, "week": week},
    )

    # Build the report CSV
    csv_bytes = build_weekly_report(week)

    bucket = os.environ.get("REPORTS_BUCKET")
    if not bucket:
        raise RuntimeError("REPORTS_BUCKET environment variable is not set")

    key = f"reports/{week}.csv"
    region = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
    s3 = boto3.client("s3", region_name=region)
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=csv_bytes,
        ContentType="text/csv",
    )
    logger.info(f"Report uploaded successfully to s3://{bucket}/{key}")

    return {
        "statusCode": 200,
        "trigger": trigger,
        "week": week,
        "bucket": bucket,
        "key": key,
    }
