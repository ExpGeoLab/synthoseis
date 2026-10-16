"""API routes for dataset management."""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import List
from server.models.schemas import DatasetConfig, DatasetResponse, DatasetPreview
from server.services.dataset_service import dataset_service

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("", response_model=List[DatasetResponse])
async def list_datasets():
    """List all datasets."""
    return dataset_service.list_datasets()


@router.post("", response_model=DatasetResponse)
async def create_dataset(config: DatasetConfig):
    """Create a new dataset."""
    try:
        dataset = await dataset_service.create_dataset(config)
        return dataset
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(dataset_id: str):
    """Get a dataset by ID."""
    dataset = dataset_service.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.delete("/{dataset_id}")
async def delete_dataset(dataset_id: str):
    """Delete a dataset."""
    success = dataset_service.delete_dataset(dataset_id)
    if not success:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"message": "Dataset deleted successfully"}


@router.get("/{dataset_id}/preview", response_model=List[DatasetPreview])
async def get_dataset_preview(dataset_id: str, num_samples: int = 5):
    """Get preview samples from a dataset."""
    dataset = dataset_service.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # TODO: Implement preview generation
    return []
