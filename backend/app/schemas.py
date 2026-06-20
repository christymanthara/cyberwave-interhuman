from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


Probability = Literal['low', 'medium', 'high']
EngagementState = Literal['engaged', 'neutral', 'disengaged']


class Signal(BaseModel):
    type: str
    start: float
    end: float
    probability: Probability
    rationale: str


class EngagementWindow(BaseModel):
    start: float
    end: float
    state: EngagementState


class ConversationQualityValues(BaseModel):
    quality_index: int
    clarity: int
    authority: int
    energy: int
    rapport: int
    learning: int


class ConversationQualityTimelinePoint(BaseModel):
    start: float
    end: float
    values: ConversationQualityValues


class ConversationQuality(BaseModel):
    overall: ConversationQualityValues
    timeline: list[ConversationQualityTimelinePoint]


class AnalysisResponse(BaseModel):
    signals: list[Signal]
    engagement_state: list[EngagementWindow]
    conversation_quality: ConversationQuality


class InterhumanError(BaseModel):
    error_id: str
    correlation_id: str
    link: str
    message: str


class StreamControlMessage(BaseModel):
    type: str = 'start'
    session_id: str | None = None
    chunk_index: int | None = None
    payload: dict[str, Any] | None = None
