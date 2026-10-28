"""Weekly meetings report generation for Spry."""

import asyncio
import csv
import io
import re
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionFactory
from app.models.meeting import Meeting


def parse_iso_week(week: str) -> tuple[int, int]:
    """Parse an ISO week string (e.g., '2026-W40') into (year, week_number)."""
    match = re.match(r"^(\d{4})-W(\d{1,2})$", week.strip())
    if not match:
        raise ValueError(f"Invalid ISO week format '{week}'. Expected format like '2026-W40'.")
    year = int(match.group(1))
    week_num = int(match.group(2))
    if not (1 <= week_num <= 53):
        raise ValueError(f"Week number out of range: {week_num}")
    return year, week_num


async def build_weekly_report_async(week: str, session: AsyncSession | None = None) -> bytes:
    """Async implementation: query meetings of one ISO week and build the CSV report."""
    year, week_num = parse_iso_week(week)

    # Current week range (Monday 00:00:00 to next Monday 00:00:00 UTC)
    start_dt = datetime.fromisocalendar(year, week_num, 1).replace(tzinfo=UTC)
    end_dt = start_dt + timedelta(days=7)

    # Previous week range
    prev_start_dt = start_dt - timedelta(days=7)
    prev_end_dt = start_dt
    prev_year, prev_week_num, _ = prev_start_dt.isocalendar()
    prev_week_str = f"{prev_year}-W{prev_week_num:02d}"

    async def _query(sess: AsyncSession) -> tuple[list[Meeting], list[Meeting]]:
        stmt_curr = (
            select(Meeting)
            .where(Meeting.start_time >= start_dt, Meeting.start_time < end_dt)
            .order_by(Meeting.duration_minutes.desc(), Meeting.start_time.asc())
        )
        stmt_prev = select(Meeting).where(
            Meeting.start_time >= prev_start_dt, Meeting.start_time < prev_end_dt
        )
        curr_res = await sess.execute(stmt_curr)
        prev_res = await sess.execute(stmt_prev)
        return list(curr_res.scalars()), list(prev_res.scalars())

    if session is not None:
        curr_meetings, prev_meetings = await _query(session)
    else:
        async with SessionFactory() as sess:
            curr_meetings, prev_meetings = await _query(sess)

    # Aggregate current week metrics
    curr_count = len(curr_meetings)
    curr_minutes = sum(m.duration_minutes for m in curr_meetings)
    curr_hours = round(curr_minutes / 60.0, 2)
    curr_cost = round(sum(float(m.estimated_cost_usd) for m in curr_meetings), 2)

    # Aggregate previous week metrics
    prev_count = len(prev_meetings)
    prev_minutes = sum(m.duration_minutes for m in prev_meetings)
    prev_hours = round(prev_minutes / 60.0, 2)
    prev_cost = round(sum(float(m.estimated_cost_usd) for m in prev_meetings), 2)

    # Week-over-week changes
    change_count = curr_count - prev_count
    change_hours = round(curr_hours - prev_hours, 2)
    change_cost = round(curr_cost - prev_cost, 2)

    # Category breakdown for current week
    cat_stats: dict[str, dict[str, float]] = defaultdict(
        lambda: {"count": 0, "minutes": 0, "cost": 0.0}
    )
    for m in curr_meetings:
        entry = cat_stats[m.category]
        entry["count"] += 1
        entry["minutes"] += m.duration_minutes
        entry["cost"] += float(m.estimated_cost_usd)

    # Top 5 longest meetings
    longest_meetings = curr_meetings[:5]

    # Generate CSV
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    # Header / Metadata
    writer.writerow(["SPRY WEEKLY MEETINGS REPORT"])
    writer.writerow(["Target Week", week])
    writer.writerow(
        [
            "Date Range (UTC)",
            f"{start_dt.strftime('%Y-%m-%d')} to "
            f"{(end_dt - timedelta(seconds=1)).strftime('%Y-%m-%d')}",
        ]
    )
    writer.writerow([])

    # Section 1: Executive Summary & Comparison
    writer.writerow(["EXECUTIVE SUMMARY & COMPARISON"])
    writer.writerow(
        ["Metric", f"Current Week ({week})", f"Previous Week ({prev_week_str})", "Change"]
    )
    writer.writerow(["Total Meetings", curr_count, prev_count, f"{change_count:+d}"])
    writer.writerow(
        ["Total Duration (hours)", f"{curr_hours:.2f}", f"{prev_hours:.2f}", f"{change_hours:+.2f}"]
    )
    writer.writerow(
        [
            "Total Estimated Cost (USD)",
            f"${curr_cost:.2f}",
            f"${prev_cost:.2f}",
            f"{'+' if change_cost >= 0 else '-'}${abs(change_cost):.2f}",
        ]
    )
    writer.writerow([])

    # Section 2: Breakdown by Category
    writer.writerow(["CATEGORY BREAKDOWN"])
    writer.writerow(["Category", "Meetings", "Total Hours", "Total Cost (USD)"])
    if cat_stats:
        for cat in sorted(cat_stats.keys()):
            stats = cat_stats[cat]
            hours = round(stats["minutes"] / 60.0, 2)
            cost = round(stats["cost"], 2)
            writer.writerow([cat, int(stats["count"]), f"{hours:.2f}", f"${cost:.2f}"])
    else:
        writer.writerow(["None", 0, "0.00", "$0.00"])
    writer.writerow([])

    # Section 3: 5 Longest Meetings
    writer.writerow(["TOP 5 LONGEST MEETINGS"])
    writer.writerow(
        [
            "Rank",
            "Title",
            "Start Time (UTC)",
            "Duration (min)",
            "Duration (hours)",
            "Attendees",
            "Category",
            "Estimated Cost (USD)",
        ]
    )
    if longest_meetings:
        for rank, m in enumerate(longest_meetings, 1):
            start_iso = (
                m.start_time.isoformat()
                if hasattr(m.start_time, "isoformat")
                else str(m.start_time)
            )
            m_hours = round(m.duration_minutes / 60.0, 2)
            writer.writerow(
                [
                    rank,
                    m.title,
                    start_iso,
                    m.duration_minutes,
                    f"{m_hours:.2f}",
                    m.attendee_count,
                    m.category,
                    f"${float(m.estimated_cost_usd):.2f}",
                ]
            )
    else:
        writer.writerow(["-", "No meetings found for this week", "-", "-", "-", "-", "-", "-"])

    return buffer.getvalue().encode("utf-8")


def build_weekly_report(week: str) -> bytes:
    """Query the meetings of one ISO week (e.g. "2026-W40") and return the CSV."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(asyncio.run, build_weekly_report_async(week))
            return future.result()
    else:
        return asyncio.run(build_weekly_report_async(week))
