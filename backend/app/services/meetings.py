import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meeting import Meeting
from app.schemas.meeting import MeetingCreate, MeetingSummary


def compute_cost(duration_minutes: int, attendee_count: int, hourly_rate_usd: float) -> float:
    return round((duration_minutes / 60.0) * attendee_count * hourly_rate_usd, 2)


async def list_meetings(session: AsyncSession) -> tuple[list[Meeting], MeetingSummary]:
    result = await session.execute(select(Meeting).order_by(Meeting.start_time.desc()))
    meetings = list(result.scalars())

    non_focus = [m for m in meetings if m.category != "deep_work"]
    deep_work = [m for m in meetings if m.category == "deep_work"]
    total_minutes = sum(m.duration_minutes for m in non_focus)
    total_hours = round(total_minutes / 60.0, 2)
    total_cost = round(sum(float(m.estimated_cost_usd) for m in non_focus), 2)

    summary = MeetingSummary(
        total_meetings=len(non_focus),
        total_hours=total_hours,
        total_cost_usd=total_cost,
        deep_work_blocks=len(deep_work),
        overload_warning=total_hours > 15.0,
    )
    return meetings, summary


async def create_meeting(session: AsyncSession, payload: MeetingCreate) -> Meeting:
    cost = (
        0.0
        if payload.category == "deep_work"
        else compute_cost(
            payload.duration_minutes,
            payload.attendee_count,
            payload.hourly_rate_usd,
        )
    )
    meeting = Meeting(
        **payload.model_dump(),
        estimated_cost_usd=cost,
    )
    session.add(meeting)
    await session.flush()
    await session.refresh(meeting)
    return meeting


async def get_meeting(session: AsyncSession, meeting_id: uuid.UUID) -> Meeting | None:
    return await session.get(Meeting, meeting_id)


async def delete_meeting(session: AsyncSession, meeting: Meeting) -> None:
    await session.delete(meeting)
    await session.flush()
