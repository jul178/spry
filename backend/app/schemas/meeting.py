import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MeetingCategory = Literal["standup", "sync", "one_on_one", "planning", "deep_work"]


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: MeetingCategory = "sync"
    start_time: datetime
    duration_minutes: int = Field(ge=5, le=480)
    attendee_count: int = Field(default=2, ge=1, le=200)
    hourly_rate_usd: float = Field(default=65.0, ge=0.0, le=1000.0)


class MeetingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    category: str
    start_time: datetime
    duration_minutes: int
    attendee_count: int
    hourly_rate_usd: float
    estimated_cost_usd: float
    created_at: datetime


class MeetingSummary(BaseModel):
    total_meetings: int
    total_hours: float
    total_cost_usd: float
    deep_work_blocks: int
    overload_warning: bool


class MeetingList(BaseModel):
    items: list[MeetingRead]
    summary: MeetingSummary
