import uuid

from fastapi import APIRouter, HTTPException, Response, status

from app.db import SessionDep
from app.schemas.meeting import MeetingCreate, MeetingList, MeetingRead
from app.services import meetings as meetings_service

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.get("", response_model=MeetingList, summary="List meetings and load summary")
async def list_meetings(session: SessionDep) -> MeetingList:
    meetings, summary = await meetings_service.list_meetings(session)
    return MeetingList(
        items=[MeetingRead.model_validate(m) for m in meetings],
        summary=summary,
    )


@router.post("", response_model=MeetingRead, status_code=status.HTTP_201_CREATED)
async def create_meeting(payload: MeetingCreate, session: SessionDep) -> MeetingRead:
    meeting = await meetings_service.create_meeting(session, payload)
    return MeetingRead.model_validate(meeting)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(meeting_id: uuid.UUID, session: SessionDep) -> Response:
    meeting = await meetings_service.get_meeting(session, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    await meetings_service.delete_meeting(session, meeting)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
