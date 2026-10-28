"""AWS Lambda entry point for Spry report mailer.

Runs outside the VPC with direct internet access to Amazon SES.
Triggered by S3 ObjectCreated events on reports/*.csv.
Downloads the report from S3 and sends it as an email attachment via SES.
"""

import email.message
import logging
import os
import urllib.parse
from typing import Any

import boto3

logger = logging.getLogger("report_mailer")
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())
if not logger.handlers:
    handler_stdout = logging.StreamHandler()
    formatter = logging.Formatter(
        "[%(asctime)s] %(levelname)s [%(name)s] %(message)s"
    )
    handler_stdout.setFormatter(formatter)
    logger.addHandler(handler_stdout)

REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
s3 = boto3.client("s3", region_name=REGION)
ses = boto3.client("sesv2", region_name=REGION)


def handler(event: dict[str, Any], context: Any = None) -> dict[str, Any]:
    """S3 ObjectCreated handler to email weekly reports."""
    records = event.get("Records", [])
    if not records:
        logger.warning("No records found in event")
        return {"statusCode": 200, "status": "no_records"}

    for record in records:
        s3_info = record.get("s3", {})
        bucket = s3_info.get("bucket", {}).get("name")
        raw_key = s3_info.get("object", {}).get("key", "")
        key = urllib.parse.unquote_plus(raw_key)

        trigger = "s3"
        logger.info(
            f"report-mailer triggered: trigger={trigger}, key={key}, bucket={bucket}",
            extra={"trigger": trigger, "key": key, "bucket": bucket},
        )

        if not key.startswith("reports/") or not key.endswith(".csv"):
            logger.info(f"Skipping key {key} (not reports/*.csv)")
            continue

        filename = os.path.basename(key)
        week = filename.removesuffix(".csv")

        # Download CSV report from S3
        obj = s3.get_object(Bucket=bucket, Key=key)
        csv_bytes = obj["Body"].read()

        sender = os.environ.get("SENDER_EMAIL")
        recipient = os.environ.get("RECIPIENT_EMAIL")
        if not sender or not recipient:
            raise RuntimeError("SENDER_EMAIL or RECIPIENT_EMAIL is not set")

        # Build email message
        msg = email.message.EmailMessage()
        msg["Subject"] = f"Spry Weekly Meetings Report - {week}"
        msg["From"] = sender
        msg["To"] = recipient

        msg.set_content(
            f"Hello,\n\n"
            f"Please find attached your Spry weekly meetings report for {week}.\n\n"
            f"Best regards,\n"
            f"The Spry Team\n"
        )

        msg.add_attachment(
            csv_bytes,
            maintype="text",
            subtype="csv",
            filename=filename,
        )

        # Send through SES v2 Raw API
        response = ses.send_email(
            Content={"Raw": {"Data": msg.as_bytes()}}
        )
        message_id = response.get("MessageId")
        logger.info(
            f"Email sent successfully for {key} to {recipient}, MessageId={message_id}"
        )

    return {"statusCode": 200, "status": "sent"}
