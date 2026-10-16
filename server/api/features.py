"""Feature preview endpoints (channels, fans, clinoforms)."""

from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


class FeaturePreviewRequest(BaseModel):
    """Parameters for a quick single-feature preview."""

    feature: Literal["channels", "fans", "clinoforms"]
    cube_size: int = Field(100, ge=40, le=300)
    digi: float = 4.0
    infill_factor: int = 10
    seed: Optional[int] = None
    # channels
    channel_count: List[int] = [1, 2]
    channel_width: List[float] = [80.0, 250.0]
    channel_thickness_scale: float = 1.0
    channel_bin_size: float = 25.0
    # clinoforms (None = random)
    n_clinoforms: Optional[int] = None
    azimuth: Optional[float] = None
    relief_m: Optional[float] = None
    foreset_angle_deg: Optional[float] = None
    step_m: Optional[float] = None
    aggradation_m: Optional[float] = None
    erosion: Optional[bool] = None  # None = random
    erosion_position: Optional[float] = None
    erosion_depth_m: Optional[float] = None
    n_valleys: Optional[int] = None
    valley_depth_m: Optional[float] = None
    stepdown_m: Optional[float] = None


@router.post("/api/features/preview")
def preview_feature_endpoint(req: FeaturePreviewRequest):
    """Generate one feature on a small grid and return its thickness map."""
    from server.services.feature_preview import preview_feature

    try:
        return preview_feature(req)
    except Exception as e:  # surface generator errors to the UI
        import logging
        import traceback

        logging.getLogger(__name__).error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
