from datetime import date
import json
import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.ai.agenda import PROMPT_VERSION, AgendaParseError, parse_agenda
from app.ai.costs import cost_usd
from app.auth import get_current_user
from app.config import get_settings
from app.db import SessionDep
from app.schemas.meeting import MeetingAgendaSave, MeetingCreate, MeetingList, MeetingRead
from app.services import meetings as meetings_service

log = logging.getLogger("spry.agenda_parser")

router = APIRouter(prefix="/meetings", tags=["meetings"])


class AgendaParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10000)
    today: str | None = None
    tz: str = "UTC"


class AgendaParseResponse(BaseModel):
    agenda: dict[str, Any]
    model: str
    prompt_version: str


@router.post(
    "/parse-agenda",
    response_model=AgendaParseResponse,
    summary="Parse raw meeting notes into a structured agenda using LLM",
)
async def parse_agenda_endpoint(
    payload: AgendaParseRequest,
    _user: dict[str, Any] | None = Depends(get_current_user),
) -> AgendaParseResponse:
    if len(payload.text) > 10000:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Pasted text exceeds maximum allowed length of 10,000 characters",
        )
    if not payload.text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Pasted text cannot be empty",
        )

    try:
        today = date.fromisoformat(payload.today) if payload.today else date.today()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid today date format: '{payload.today}'",
        )

    settings = get_settings()
    started = time.monotonic()
    try:
        agenda, usage = parse_agenda(payload.text, today, payload.tz)
    except AgendaParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    model_used = usage.get("model", settings.parser_model)
    sub = (_user or {}).get("sub", "dev-user")
    latency_ms = int((time.monotonic() - started) * 1000)
    cost = cost_usd(model_used, usage)

    log_entry = {
        "event": "agenda_parsed",
        "user": sub,
        "model": model_used,
        "prompt_version": PROMPT_VERSION,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "latency_ms": latency_ms,
        "cost_usd": cost,
    }
    log.info(json.dumps(log_entry))

    return AgendaParseResponse(
        agenda=agenda.model_dump(mode="json"),
        model=model_used,
        prompt_version=PROMPT_VERSION,
    )


@router.get("", response_model=MeetingList, summary="List meetings and load summary")
async def list_meetings(
    session: SessionDep,
    _user: dict[str, Any] | None = Depends(get_current_user),
) -> MeetingList:
    meetings, summary = await meetings_service.list_meetings(session)
    return MeetingList(
        items=[MeetingRead.model_validate(m) for m in meetings],
        summary=summary,
    )


@router.post("", response_model=MeetingRead, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    payload: MeetingCreate,
    session: SessionDep,
    _user: dict[str, Any] | None = Depends(get_current_user),
) -> MeetingRead:
    meeting = await meetings_service.create_meeting(session, payload)
    return MeetingRead.model_validate(meeting)


@router.post(
    "/{meeting_id}/agenda",
    response_model=MeetingRead,
    summary="Save validated agenda and optional AI suggestion",
)
async def save_meeting_agenda(
    meeting_id: uuid.UUID,
    payload: MeetingAgendaSave,
    session: SessionDep,
    _user: dict[str, Any] | None = Depends(get_current_user),
) -> MeetingRead:
    meeting = await meetings_service.get_meeting(session, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    updated = await meetings_service.save_meeting_agenda(
        session, meeting, payload.agenda.model_dump(mode="json"), payload.ai_suggestion
    )
    return MeetingRead.model_validate(updated)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(meeting_id: uuid.UUID, session: SessionDep) -> Response:
    meeting = await meetings_service.get_meeting(session, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    await meetings_service.delete_meeting(session, meeting)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
