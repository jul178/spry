import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.auth import get_current_user
from app.db import SessionDep
from app.schemas.meeting import MeetingAgendaSave, MeetingCreate, MeetingList, MeetingRead
from app.services import meetings as meetings_service

router = APIRouter(prefix="/meetings", tags=["meetings"])


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
