from datetime import date, datetime

from pydantic import BaseModel, Field


class AgendaItem(BaseModel):
    topic: str = Field(min_length=1, max_length=500)
    owner: str | None = Field(default=None, max_length=200)
    minutes: int | None = Field(default=None, ge=1, le=480)


class ActionItem(BaseModel):
    task: str = Field(min_length=1, max_length=1000)
    owner: str | None = Field(default=None, max_length=200)
    due: date | None = None


class ParsedAgenda(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    starts_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=600)
    items: list[AgendaItem] = Field(default_factory=list, max_length=100)
    action_items: list[ActionItem] = Field(default_factory=list, max_length=100)
    language: str = Field(default="en", min_length=2, max_length=16)
