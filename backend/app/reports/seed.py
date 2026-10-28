"""Seed demo meetings for the last 3 ISO weeks so the weekly report has data."""

import asyncio
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.db import SessionFactory
from app.models.meeting import Meeting

# (title, category, duration_minutes, attendees)
SAMPLES = [
    ("Daily standup", "sync", 15, 6),
    ("Sprint planning", "planning", 90, 8),
    ("Design review", "review", 60, 5),
    ("1:1 with manager", "one_on_one", 30, 2),
    ("Retrospective", "retro", 60, 7),
    ("Customer call", "external", 45, 4),
    ("Architecture deep-dive", "planning", 120, 6),
    ("All-hands", "all_hands", 60, 25),
]
RATE = 65.0


async def seed_meetings(weeks: int = 3, force: bool = False) -> int:
    """Insert demo meetings for the previous `weeks` weeks. Skips if the table has rows."""
    async with SessionFactory() as session:
        existing = (await session.execute(select(func.count()).select_from(Meeting))).scalar_one()
        if existing and not force:
            return 0

        rng = random.Random(42)
        today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        this_monday = today - timedelta(days=today.weekday())

        rows: list[Meeting] = []
        for w in range(1, weeks + 1):
            week_start = this_monday - timedelta(weeks=w)
            for day in range(5):
                for title, category, minutes, people in rng.sample(SAMPLES, k=rng.randint(2, 4)):
                    start = week_start + timedelta(days=day, hours=rng.randint(9, 16))
                    rows.append(
                        Meeting(
                            title=title,
                            category=category,
                            start_time=start,
                            duration_minutes=minutes,
                            attendee_count=people,
                            hourly_rate_usd=RATE,
                            estimated_cost_usd=round(minutes / 60 * RATE * people, 2),
                        )
                    )
        session.add_all(rows)
        await session.commit()
        return len(rows)


if __name__ == "__main__":
    print(f"seeded {asyncio.run(seed_meetings())} meetings")
