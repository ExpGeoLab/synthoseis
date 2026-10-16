"""API routes for the Synthoseis server."""

import os
import json
import glob
import base64
import io
import sys
from pathlib import Path
from typing import Optional, List
import numpy as np
from fastapi import APIRouter, HTTPException, status, Query
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from datetime import datetime

# Add datagenerator to path for importing path utilities
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from datagenerator.paths import get_output_folder_path

from server.models.schemas import (
    RunResponse,
    RunCreate,
    RunStatus,
    ConfigSummary,
    ModelConfig,
    DashboardStats,
    QCImage,
    RockPhysicsConfig,
    VolumeInfo,
)
from server.services.storage import get_storage_service
from server.services.runner import get_runner_service


router = APIRouter()


# ============ DASHBOARD ============


@router.get("/api/dashboard", response_model=DashboardStats)
def get_dashboard_stats():
    """Get dashboard statistics."""
    storage = get_storage_service()
    return storage.get_dashboard_stats()


# ============ RUNS ============


@router.get("/api/runs", response_model=list[RunResponse])
def list_runs(status: Optional[RunStatus] = None):
    """List all runs, optionally filtered by status."""
    storage = get_storage_service()
    return storage.list_runs(status=status)


@router.post("/api/runs", response_model=RunResponse)
def create_run(run_create: RunCreate):
    """Start a new synthoseis model run."""
    storage = get_storage_service()
    runner = get_runner_service(storage)

    # Save config first
    storage.save_config(run_create.config_name, run_create.config)

    # Start the run
    return runner.start_run(
        config=run_create.config,
        config_name=run_create.config_name,
        num_runs=run_create.num_runs,
        run_id=run_create.run_id,
        test_mode=run_create.test_mode,
    )


@router.get("/api/runs/{run_id}", response_model=RunResponse)
def get_run(run_id: str):
    """Get a specific run by ID."""
    storage = get_storage_service()
    run = storage.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.delete("/api/runs/{run_id}")
def delete_run(run_id: str):
    """Delete a run."""
    storage = get_storage_service()
    if storage.delete_run(run_id):
        return {"message": "Run deleted successfully"}
    raise HTTPException(status_code=404, detail="Run not found")


@router.post("/api/runs/{run_id}/cancel")
def cancel_run(run_id: str):
    """Cancel a running process."""
    storage = get_storage_service()
    runner = get_runner_service(storage)
    if runner.cancel_run(run_id):
        return {"message": "Run cancelled successfully"}
    raise HTTPException(status_code=404, detail="Run not found or not running")


@router.get("/api/runs/{run_id}/qc", response_model=list[QCImage])
def get_run_qc_images(run_id: str):
    """Get QC images for a completed run."""
    storage = get_storage_service()
    runner = get_runner_service(storage)

    run = storage.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    return runner.get_qc_images(run_id)


@router.get("/api/runs/{run_id}/qc/{filename}")
def get_run_qc_image(run_id: str, filename: str):
    """Get a specific QC image file."""
    storage = get_storage_service()
    runner = get_runner_service(storage)

    run = storage.get_run(run_id)
    if not run or not run.output_folder:
        raise HTTPException(status_code=404, detail="Run or output not found")

    image_path = os.path.join(run.output_folder, filename)
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(image_path)


@router.get("/api/runs/{run_id}/volumes", response_model=List[VolumeInfo])
def get_run_volumes(run_id: str):
    """Get available volumes for a completed run."""
    storage = get_storage_service()
    run = storage.get_run(run_id)
    if not run or not run.output_folder:
        raise HTTPException(status_code=404, detail="Run or output not found")

    volumes = []

    # With unified paths, we only need to search the actual output folder
    output_folder = run.output_folder

    print(f"DEBUG: Looking for volumes in: {output_folder}")
    print(f"DEBUG: Folder exists: {os.path.exists(output_folder)}")

    # Find all .npy files in the output folder
    if os.path.exists(output_folder):
        npy_files = glob.glob(os.path.join(output_folder, "*.npy"))
        print(f"DEBUG: Found {len(npy_files)} .npy files")
        for npy_file in npy_files:
            print(f"DEBUG: Processing file: {npy_file}")
            try:
                data = np.load(npy_file, mmap_mode="r")
                volumes.append(
                    VolumeInfo(
                        name=os.path.basename(npy_file).replace(".npy", ""),
                        filename=os.path.basename(npy_file),
                        shape=list(data.shape),
                        path=npy_file,
                        url=f"/api/runs/{run_id}/volumes/{os.path.basename(npy_file)}",
                    )
                )
                print(f"DEBUG: Added volume: {os.path.basename(npy_file)}")
            except Exception as e:
                print(f"DEBUG: Error loading {npy_file}: {e}")
                pass  # Skip files that can't be loaded
    else:
        print(f"DEBUG: Output folder does not exist: {output_folder}")

    return volumes


@router.get("/api/runs/{run_id}/volumes/{volume_name}")
def get_volume_slice(
    run_id: str,
    volume_name: str,
    slice_index: int = Query(300, description="Slice index"),
    slice_type: str = Query(
        "depth", description="Slice type: inline, crossline, depth"
    ),
):
    """Get a slice from a volume as an image."""
    storage = get_storage_service()
    run = storage.get_run(run_id)
    if not run or not run.output_folder:
        raise HTTPException(status_code=404, detail="Run or output not found")

    # With unified paths, volume should be in the output folder
    output_folder = run.output_folder

    print(f"DEBUG get_volume_slice: output_folder={output_folder}")
    print(f"DEBUG get_volume_slice: looking for volume_name={volume_name}")

    volume_path = os.path.join(output_folder, volume_name)
    print(
        f"DEBUG get_volume_slice: checking path={volume_path}, exists={os.path.exists(volume_path)}"
    )

    if not os.path.exists(volume_path):
        # Try with .npy extension
        volume_path = os.path.join(output_folder, f"{volume_name}.npy")
        print(
            f"DEBUG get_volume_slice: checking with .npy extension: {volume_path}, exists={os.path.exists(volume_path)}"
        )

    if not os.path.exists(volume_path):
        raise HTTPException(status_code=404, detail="Volume not found")

    try:
        data = np.load(volume_path)

        # Get the slice based on type
        if slice_type == "depth":
            if slice_index >= data.shape[2]:
                slice_index = data.shape[2] // 2
            slice_data = data[:, :, slice_index].T
        elif slice_type == "inline":
            if slice_index >= data.shape[0]:
                slice_index = data.shape[0] // 2
            slice_data = data[slice_index, :, :].T
        elif slice_type == "crossline":
            if slice_index >= data.shape[1]:
                slice_index = data.shape[1] // 2
            slice_data = data[:, slice_index, :].T
        else:
            raise HTTPException(status_code=400, detail="Invalid slice_type")

        # Normalize for display
        vmin, vmax = np.percentile(slice_data, [2, 98])
        slice_data = np.clip(slice_data, vmin, vmax)
        slice_data = (slice_data - vmin) / (vmax - vmin + 1e-10)

        # Convert to uint8 for PNG
        slice_data = (slice_data * 255).astype(np.uint8)

        # Create PIL Image
        from PIL import Image

        img = Image.fromarray(slice_data, mode="L")

        # Save to bytes
        img_bytes = io.BytesIO()
        img.save(img_bytes, format="PNG")
        img_bytes.seek(0)

        return StreamingResponse(img_bytes, media_type="image/png")

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error processing volume: {str(e)}"
        )


# ============ CONFIGS ============


@router.get("/api/configs", response_model=list[ConfigSummary])
def list_configs():
    """List all saved configurations."""
    storage = get_storage_service()
    return storage.list_configs()


@router.post("/api/configs/{config_name}")
def save_config(config_name: str, config: ModelConfig):
    """Save a configuration."""
    storage = get_storage_service()
    return storage.save_config(config_name, config)


@router.get("/api/configs/{config_name}", response_model=ModelConfig)
def get_config(config_name: str):
    """Get a specific configuration."""
    storage = get_storage_service()
    config = storage.get_config_full(config_name)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return config


@router.delete("/api/configs/{config_name}")
def delete_config(config_name: str):
    """Delete a configuration."""
    storage = get_storage_service()
    if storage.delete_config(config_name):
        return {"message": "Config deleted successfully"}
    raise HTTPException(status_code=404, detail="Config not found")


# ============ DEFAULT CONFIG ============


@router.get("/api/configs/default/model", response_model=ModelConfig)
def get_default_config():
    """Get the default configuration."""
    return ModelConfig()


# ============ ROCK PHYSICS ============

from server.models.schemas import RockPhysicsConfig

# Get absolute path to data directory
DATA_DIR = Path(__file__).parent.parent.parent / "data"
ROCK_PHYSICS_DIR = DATA_DIR / "rockphysics"


@router.get("/api/rockphysics", response_model=list[ConfigSummary])
def list_rockphysics():
    """List all saved rock physics configs."""
    storage = get_storage_service()
    return storage.list_configs()


@router.get("/api/rockphysics/{name}", response_model=RockPhysicsConfig)
def get_rockphysics(name: str):
    """Get a rock physics config."""
    file_path = ROCK_PHYSICS_DIR / f"{name}.json"
    if not file_path.exists():
        # Return default values
        default = RockPhysicsConfig()
        return default.model_dump()
    with open(file_path) as f:
        data = json.load(f)
    return RockPhysicsConfig(**data)


@router.post("/api/rockphysics/{name}")
def save_rockphysics(name: str, config: RockPhysicsConfig):
    """Save a rock physics config."""
    ROCK_PHYSICS_DIR.mkdir(parents=True, exist_ok=True)
    file_path = ROCK_PHYSICS_DIR / f"{name}.json"
    with open(file_path, "w") as f:
        json.dump(config.model_dump(), f, indent=2)
    return {"message": "Saved"}


@router.delete("/api/rockphysics/{name}")
def delete_rockphysics(name: str):
    """Delete a rock physics config."""
    file_path = ROCK_PHYSICS_DIR / f"{name}.json"
    if file_path.exists():
        file_path.unlink()
        return {"message": "Deleted"}
    raise HTTPException(status_code=404, detail="Config not found")


# ============ FAULTS ============

from pydantic import BaseModel
import numpy as np


class FaultConfig(BaseModel):
    """Fault configuration parameters"""

    name: str = "default"
    min_number_faults: int = 1
    max_number_faults: int = 6
    infill_factor: int = 10
    preferred_fault_modes: list[str] = []
    preferred_noise_types: list[str] = []


FAULT_CONFIG_DIR = DATA_DIR / "faults"


@router.get("/api/faults/{name}", response_model=FaultConfig)
def get_faults(name: str):
    """Get a fault configuration."""
    file_path = FAULT_CONFIG_DIR / f"{name}.json"
    if not file_path.exists():
        default = FaultConfig()
        return default.model_dump()
    with open(file_path) as f:
        data = json.load(f)
    return FaultConfig(**data)


@router.post("/api/faults/{name}")
def save_faults(name: str, config: FaultConfig):
    """Save a fault configuration."""
    FAULT_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    file_path = FAULT_CONFIG_DIR / f"{name}.json"
    with open(file_path, "w") as f:
        json.dump(config.model_dump(), f, indent=2)
    return {"message": "Saved"}


@router.delete("/api/faults/{name}")
def delete_faults(name: str):
    """Delete a fault configuration."""
    file_path = FAULT_CONFIG_DIR / f"{name}.json"
    if file_path.exists():
        file_path.unlink()
        return {"message": "Deleted"}
    raise HTTPException(status_code=404, detail="Config not found")


# ============ WAVELETS ============

from pydantic import BaseModel
import numpy as np


class WaveletParams(BaseModel):
    """Parameters for wavelet generation"""

    wavelet_type: str = "ricker"
    frequency: float = 25.0
    dt: float = 4.0
    convolutions: int = 2
    duration_ms: float = 200.0


@router.post("/api/wavelets/generate")
def generate_wavelet(params: WaveletParams):
    """Generate a wavelet and return its data"""
    import logging

    logger = logging.getLogger(__name__)

    try:
        import sys

        sys.path.insert(0, str(Path(__file__).parent.parent.parent))
        from datagenerator.wavelets import ricker

        logger.info(f"Generating wavelet with params: {params}")

        # Generate wavelet
        t, s = ricker(params.frequency, params.dt, params.convolutions)

        # Convert to numpy arrays
        t_arr = np.array(t)
        s_arr = np.array(s)

        logger.info(f"Raw t shape: {t_arr.shape}, s shape: {s_arr.shape}")

        # Create a proper time array that matches s length
        # The time array should span the full wavelet duration
        half_len = len(s_arr) // 2
        dt_sec = params.dt / 1000.0  # Convert ms to seconds
        full_time = np.arange(-half_len, half_len + 1) * dt_sec * 1000  # Back to ms

        # Limit to duration
        half_duration = params.duration_ms / 2
        mask = np.abs(full_time) <= half_duration

        logger.info(f"Full time shape: {full_time.shape}, mask sum: {mask.sum()}")

        # Apply mask to both
        time_limited = full_time[mask].tolist()
        amp_limited = s_arr[mask].tolist()

        logger.info(f"Returning {len(time_limited)} points")

        return {
            "time": time_limited,
            "amplitude": amp_limited,
            "params": params.model_dump(),
        }
    except Exception as e:
        logger.error(f"Error generating wavelet: {str(e)}")
        import traceback

        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/wavelets/generate-batch")
def generate_wavelet_batch(params: WaveletParams, count: int = 3):
    """Generate multiple wavelets with slight variations"""
    import logging

    logger = logging.getLogger(__name__)

    try:
        import sys

        sys.path.insert(0, str(Path(__file__).parent.parent.parent))
        from datagenerator.wavelets import ricker

        wavelets = []
        freq_variation = params.frequency * 0.15

        for i in range(count):
            # Vary frequency slightly for each wavelet
            freq = params.frequency + np.random.uniform(-freq_variation, freq_variation)
            t, s = ricker(freq, params.dt, params.convolutions)

            # Convert to numpy arrays
            s_arr = np.array(s)

            # Create proper time array matching s length
            half_len = len(s_arr) // 2
            dt_sec = params.dt / 1000.0
            full_time = np.arange(-half_len, half_len + 1) * dt_sec * 1000

            half_duration = params.duration_ms / 2
            mask = np.abs(full_time) <= half_duration

            wavelets.append(
                {
                    "time": full_time[mask].tolist(),
                    "amplitude": s_arr[mask].tolist(),
                    "frequency": freq,
                }
            )

        return {"wavelets": wavelets, "base_params": params.model_dump()}
    except Exception as e:
        logger.error(f"Error generating batch wavelets: {str(e)}")
        import traceback

        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# ============ DATASETS ============

from server.models.schemas import DatasetConfig, DatasetResponse, DatasetPreview
from server.services.dataset_service import dataset_service


@router.get("/api/datasets", response_model=list[DatasetResponse])
def list_datasets():
    """List all datasets."""
    return dataset_service.list_datasets()


@router.post("/api/datasets", response_model=DatasetResponse)
async def create_dataset(config: DatasetConfig):
    """Create a new dataset."""
    try:
        dataset = await dataset_service.create_dataset(config)
        return dataset
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/api/datasets/{dataset_id}", response_model=DatasetResponse)
def get_dataset(dataset_id: str):
    """Get a dataset by ID."""
    dataset = dataset_service.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.delete("/api/datasets/{dataset_id}")
def delete_dataset(dataset_id: str):
    """Delete a dataset."""
    success = dataset_service.delete_dataset(dataset_id)
    if not success:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"message": "Dataset deleted successfully"}


@router.get("/api/datasets/{dataset_id}/preview", response_model=list[DatasetPreview])
def get_dataset_preview(dataset_id: str, num_samples: int = 5):
    """Get preview samples from a dataset."""
    dataset = dataset_service.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # TODO: Implement preview generation
    return []


# ============ SYSTEM SETTINGS & HISTORIC RUN DISCOVERY ============

from server.models.schemas import SystemSettings, HistoricRunDiscovery
from server.services.historic_discovery import HistoricRunDiscoveryService

# Initialize discovery service
discovery_service: Optional[HistoricRunDiscoveryService] = None


def get_discovery_service() -> HistoricRunDiscoveryService:
    """Get or create the discovery service."""
    global discovery_service
    if discovery_service is None:
        storage = get_storage_service()
        discovery_service = HistoricRunDiscoveryService(storage)
    return discovery_service


@router.get("/api/system/settings", response_model=SystemSettings)
def get_system_settings():
    """Get system settings."""
    service = get_discovery_service()
    return service.get_settings()


@router.post("/api/system/settings")
def update_system_settings(settings: dict):
    """Update system settings."""
    service = get_discovery_service()

    # Update only allowed fields
    allowed_fields = ["auto_discover_historic_runs", "work_folder", "project_folder"]
    updates = {k: v for k, v in settings.items() if k in allowed_fields}

    service.update_settings(**updates)
    return service.get_settings()


@router.get("/api/system/discover-runs", response_model=list[HistoricRunDiscovery])
def discover_historic_runs(auto_import: bool = False):
    """Scan for historic runs on disk.

    Args:
        auto_import: If True, automatically import discovered runs to storage
    """
    service = get_discovery_service()
    discovered = service.discover_historic_runs(auto_import=auto_import)
    return discovered


@router.post("/api/system/import-run/{run_id}")
def import_historic_run(run_id: str):
    """Import a specific historic run into storage."""
    service = get_discovery_service()
    run = service.import_historic_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.post("/api/system/run-discovery")
def run_auto_discovery():
    """Manually trigger auto-discovery."""
    service = get_discovery_service()
    if service.settings.auto_discover_historic_runs:
        service.run_auto_discovery()
        return {"message": "Auto-discovery completed", "enabled": True}
    else:
        return {"message": "Auto-discovery is disabled", "enabled": False}


@router.post("/api/system/validate-paths")
def validate_paths(paths: dict):
    """Validate that the specified paths exist and are accessible."""
    import os

    work_folder = paths.get("work_folder", "")
    project_folder = paths.get("project_folder", "")

    result = {
        "work_folder": {
            "path": work_folder,
            "exists": os.path.exists(work_folder) if work_folder else False,
            "is_directory": os.path.isdir(work_folder)
            if work_folder and os.path.exists(work_folder)
            else False,
        },
        "project_folder": {
            "path": project_folder,
            "exists": os.path.exists(project_folder) if project_folder else False,
            "is_directory": os.path.isdir(project_folder)
            if project_folder and os.path.exists(project_folder)
            else False,
        },
    }

    # Check if paths are valid
    result["valid"] = (not work_folder or result["work_folder"]["exists"]) and (
        not project_folder or result["project_folder"]["exists"]
    )

    return result


# ============ DATASET AUGMENTATION ============

from server.models.schemas import AugmentationConfig, AugmentationJob
from server.services.augmentation_service import augmentation_service


@router.post("/api/datasets/{dataset_id}/augment")
async def augment_dataset(dataset_id: str, config: AugmentationConfig):
    """Start augmentation on an existing dataset."""
    try:
        job = await augmentation_service.augment_dataset(dataset_id, config)
        return job
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/api/datasets/{dataset_id}/augment/status")
def get_augmentation_status(dataset_id: str):
    """Get augmentation status for a dataset."""
    jobs = augmentation_service.get_jobs_for_dataset(dataset_id)
    if not jobs:
        return {"status": "none", "jobs": []}
    return {"status": jobs[0].status.value, "jobs": jobs}


@router.get("/api/augment/jobs", response_model=list[AugmentationJob])
def list_augmentation_jobs():
    """List all augmentation jobs."""
    return augmentation_service.list_jobs()


@router.delete("/api/augment/jobs/{job_id}")
def delete_augmentation(job_id: str):
    """Delete an augmentation job and its data."""
    success = augmentation_service.delete_augmentation(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Augmentation job not found")
    return {"message": "Augmentation deleted successfully"}
