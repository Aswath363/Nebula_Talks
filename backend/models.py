"""
Pydantic models for person detection API
"""
from pydantic import BaseModel
from typing import Optional


class PersonDetectionRequest(BaseModel):
    """Request model for person detection"""
    image_data: str  # Base64 encoded image
    confidence_threshold: float = 0.6
    frame_id: Optional[str] = None


class BoundingBox(BaseModel):
    """Bounding box coordinates"""
    x1: float
    y1: float
    x2: float
    y2: float


class PersonDetectionResponse(BaseModel):
    """Response model for person detection"""
    person_found: bool
    confidence: float
    bounding_box: Optional[BoundingBox] = None
    processing_time_ms: float
    frame_id: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    model_loaded: bool
