"""Augmentation service for creating augmented dataset variants."""

import os
import json
import uuid
import glob
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
import asyncio
from concurrent.futures import ThreadPoolExecutor

from server.models.schemas import (
    AugmentationConfig,
    AugmentationMethod,
    AugmentationStatus,
    AugmentationJob,
    AugmentedSampleInfo,
    AugmentationMetadata,
    DatasetResponse,
)
from server.services.storage import get_storage_service

# Import real augmentation functions from datagenerator
from datagenerator.Augmentation import (
    tz_stretch,
    uniform_stretch,
    horizontal_flip,
    jitter,
)


class AugmentationService:
    """Service for augmenting datasets."""

    def __init__(self):
        self._executor = ThreadPoolExecutor(max_workers=2)
        self.jobs: Dict[str, AugmentationJob] = {}
        self._load_existing_jobs()

    def _get_augmentation_metadata_path(self, dataset_path: str) -> Path:
        """Get path to augmentation metadata file."""
        return Path(dataset_path) / "augmentation_metadata.json"

    def _load_existing_jobs(self):
        """Load existing augmentation jobs from dataset folders."""
        storage = get_storage_service()
        try:
            datasets = storage.list_datasets()
            for dataset in datasets:
                if dataset.output_path:
                    metadata_path = self._get_augmentation_metadata_path(
                        dataset.output_path
                    )
                    if metadata_path.exists():
                        try:
                            with open(metadata_path, "r", encoding="utf-8") as f:
                                metadata = json.load(f)
                                # Create a job from metadata
                                job = AugmentationJob(
                                    id=metadata.get("job_id", str(uuid.uuid4())),
                                    dataset_id=dataset.id,
                                    status=AugmentationStatus.COMPLETED,
                                    config=AugmentationConfig(
                                        **metadata.get("config", {})
                                    ),
                                    created_at=datetime.fromisoformat(
                                        metadata.get("created_at")
                                    ),
                                    completed_at=datetime.fromisoformat(
                                        metadata.get("created_at")
                                    ),
                                    samples_processed=metadata.get(
                                        "total_augmented", 0
                                    ),
                                    total_samples=metadata.get("total_augmented", 0),
                                )
                                self.jobs[job.id] = job
                        except Exception as e:
                            print(
                                f"Failed to load augmentation metadata for {dataset.id}: {e}"
                            )
        except Exception as e:
            print(f"Failed to load existing augmentation jobs: {e}")

    def list_jobs(self) -> List[AugmentationJob]:
        """List all augmentation jobs."""
        return sorted(self.jobs.values(), key=lambda x: x.created_at, reverse=True)

    def get_job(self, job_id: str) -> Optional[AugmentationJob]:
        """Get a specific augmentation job."""
        return self.jobs.get(job_id)

    def get_jobs_for_dataset(self, dataset_id: str) -> List[AugmentationJob]:
        """Get all augmentation jobs for a specific dataset."""
        return [job for job in self.jobs.values() if job.dataset_id == dataset_id]

    async def augment_dataset(
        self, dataset_id: str, config: AugmentationConfig
    ) -> AugmentationJob:
        """Start augmentation of a dataset."""
        job_id = str(uuid.uuid4())

        job = AugmentationJob(
            id=job_id,
            dataset_id=dataset_id,
            status=AugmentationStatus.PENDING,
            config=config,
            created_at=datetime.now(),
            samples_processed=0,
            total_samples=0,
        )

        self.jobs[job_id] = job

        # Start processing in background
        asyncio.create_task(self._process_augmentation(job_id))

        return job

    async def _process_augmentation(self, job_id: str):
        """Process augmentation in the background."""
        job = self.jobs.get(job_id)
        if not job:
            return

        try:
            storage = get_storage_service()
            dataset = storage.get_run(job.dataset_id)

            # Try to get from storage service first (as run), then try dataset service
            if not dataset:
                # Try loading from dataset service
                from server.services.dataset_service import dataset_service

                dataset = dataset_service.get_dataset(job.dataset_id)

            if not dataset or not dataset.output_path:
                raise ValueError(
                    f"Dataset {job.dataset_id} not found or has no output path"
                )

            output_path = Path(dataset.output_path)

            # Get training samples
            train_seismic_path = output_path / "seismic"
            train_label_path = output_path / "label"

            if not train_seismic_path.exists():
                raise ValueError("Training data not found")

            # Get list of training samples
            seismic_files = sorted(glob.glob(str(train_seismic_path / "*.dat")))
            label_files = sorted(glob.glob(str(train_label_path / "*.dat")))

            if len(seismic_files) != len(label_files):
                raise ValueError(
                    f"Mismatch: {len(seismic_files)} seismic files, {len(label_files)} label files"
                )

            num_samples = len(seismic_files)
            job.total_samples = num_samples * job.config.augment_factor
            job.status = AugmentationStatus.PROCESSING

            print(
                f"DEBUG: Starting augmentation of {num_samples} samples with factor {job.config.augment_factor}"
            )
            print(f"DEBUG: Will generate {job.total_samples} augmented samples")

            # Load patch shape from dataset metadata
            patch_shape = self._load_patch_shape(output_path)
            size_x, size_y, size_z = patch_shape
            total_elements = size_x * size_y * size_z
            print(
                f"DEBUG: Patch shape: {patch_shape}, total elements: {total_elements}"
            )

            # Verify first sample size
            first_sample = np.fromfile(seismic_files[0], dtype=np.float32)
            if len(first_sample) != total_elements:
                print(
                    f"DEBUG: Warning - Sample size mismatch. Expected {total_elements}, got {len(first_sample)}"
                )
                # Use actual sample size to determine shape
                total_elements = len(first_sample)
                # Try to infer cubic shape
                cube_size = int(round(total_elements ** (1 / 3)))
                if cube_size**3 == total_elements:
                    patch_shape = (cube_size, cube_size, cube_size)
                else:
                    patch_shape = (48, 48, 1)  # Fallback
                print(f"DEBUG: Adjusted patch shape to: {patch_shape}")

            # Process samples
            augmented_samples = []
            next_index = num_samples  # Continue naming from after original samples

            for orig_idx in range(num_samples):
                # Load original sample
                seismic = np.fromfile(seismic_files[orig_idx], dtype=np.float32)
                label = np.fromfile(label_files[orig_idx], dtype=np.float32)

                # Generate augmented versions
                for aug_idx in range(job.config.augment_factor):
                    # Apply augmentation methods
                    (
                        aug_seismic,
                        aug_label,
                        methods_used,
                        params,
                    ) = await self._apply_augmentation(
                        seismic.copy(),
                        label.copy(),
                        job.config.methods,
                        job.config.seed + orig_idx + aug_idx,
                        patch_shape,
                        job.config,
                    )

                    # Save augmented sample with continued naming
                    filename = f"{next_index:06d}.dat"
                    aug_seismic.tofile(train_seismic_path / filename)
                    aug_label.tofile(train_label_path / filename)

                    # Track sample info
                    augmented_samples.append(
                        AugmentedSampleInfo(
                            index=next_index,
                            original_index=orig_idx,
                            methods_applied=methods_used,
                            parameters=params,
                        )
                    )

                    next_index += 1
                    job.samples_processed += 1

                    if job.samples_processed % 10 == 0:
                        print(
                            f"DEBUG: Augmented {job.samples_processed}/{job.total_samples} samples"
                        )

                if orig_idx % 10 == 0:
                    print(f"DEBUG: Processed original sample {orig_idx}/{num_samples}")

            # Save augmentation metadata
            metadata = AugmentationMetadata(
                job_id=job_id,
                dataset_id=job.dataset_id,
                created_at=job.created_at,
                config=job.config,
                samples=augmented_samples,
                total_augmented=len(augmented_samples),
            )

            metadata_path = self._get_augmentation_metadata_path(dataset.output_path)
            with open(metadata_path, "w", encoding="utf-8") as f:
                json.dump(metadata.dict(), f, indent=2, default=str)

            # Update dataset metadata with augmentation info
            dataset_metadata_path = output_path / "metadata.json"
            if dataset_metadata_path.exists():
                with open(dataset_metadata_path, "r", encoding="utf-8") as f:
                    dataset_meta = json.load(f)

                # Update sample counts
                original_train = dataset_meta.get("sample_counts", {}).get("train", 0)
                dataset_meta["sample_counts"]["train"] = original_train + len(
                    augmented_samples
                )
                dataset_meta["augmentation"] = {
                    "enabled": True,
                    "job_id": job_id,
                    "total_augmented": len(augmented_samples),
                    "methods": [m.value for m in job.config.methods],
                }

                with open(dataset_metadata_path, "w", encoding="utf-8") as f:
                    json.dump(dataset_meta, f, indent=2, default=str)

            # Update job status
            job.status = AugmentationStatus.COMPLETED
            job.completed_at = datetime.now()

            print(
                f"DEBUG: Augmentation completed. Generated {len(augmented_samples)} augmented samples"
            )
            print(
                f"DEBUG: Total training samples: {num_samples} original + {len(augmented_samples)} augmented"
            )

        except Exception as e:
            job.status = AugmentationStatus.FAILED
            job.error_message = str(e)
            print(f"Augmentation failed: {e}")
            import traceback

            traceback.print_exc()

    def _load_patch_shape(self, dataset_path: Path) -> Tuple[int, int, int]:
        """Load patch shape from dataset metadata."""
        metadata_path = dataset_path / "metadata.json"
        if metadata_path.exists():
            with open(metadata_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)
                config = metadata.get("config", {})
                patch_config = config.get("patch_config", {})
                return (
                    patch_config.get("size_x", 48),
                    patch_config.get("size_y", 48),
                    patch_config.get("size_z", 1),
                )
        return (48, 48, 1)  # Default fallback

    async def _apply_augmentation(
        self,
        seismic: np.ndarray,
        label: np.ndarray,
        methods: List[AugmentationMethod],
        seed: int,
        patch_shape: Tuple[int, int, int] = (48, 48, 1),
        aug_config: AugmentationConfig = None,
    ) -> Tuple[np.ndarray, np.ndarray, List[AugmentationMethod], Dict[str, Any]]:
        """Apply augmentation methods to a sample using real implementations from Augmentation.py."""
        np.random.seed(seed)
        methods_used = []
        params = {}

        size_x, size_y, size_z = patch_shape
        total_elements = size_x * size_y * size_z

        try:
            # Reshape seismic to 4D: (1 angle, x, y, z) for tz_stretch compatibility
            seismic_4d = seismic[:total_elements].reshape(1, size_x, size_y, size_z)

            # Reshape label to 3D: (x, y, z)
            label_3d = label[:total_elements].reshape(size_x, size_y, size_z)

            for method in methods:
                if method == AugmentationMethod.TZ_STRETCH:
                    # Create water bottom map (seafloor) - assume flat for patches
                    # In real seismic this varies, but for patches we use a constant
                    wb = np.full((size_x, size_y), size_z * 0.2)  # 20% down

                    # Apply real tz_stretch
                    seismic_4d, label_3d = tz_stretch(seismic_4d, label_3d, wb)
                    methods_used.append(method)
                    params["tz_stretch"] = {
                        "water_bottom_mean": float(wb.mean()),
                        "squeeze_depth": float(
                            np.random.triangular(
                                size_z * 0.3, size_z * 0.5, size_z * 0.8
                            )
                        ),
                    }

                elif method == AugmentationMethod.UNIFORM_STRETCH:
                    # Apply real uniform_stretch
                    seismic_4d, label_3d = uniform_stretch(seismic_4d, label_3d)
                    methods_used.append(method)
                    params["uniform_stretch"] = {
                        "squeeze_factors_applied": True,
                    }

                elif method == AugmentationMethod.HORIZONTAL_FLIP:
                    # Apply horizontal/vertical flip
                    # Random direction per sample (B: random per sample)
                    direction = np.random.choice(["horizontal", "vertical", "both"])
                    seismic_4d, label_3d = horizontal_flip(
                        seismic_4d, label_3d, direction
                    )
                    methods_used.append(method)
                    params["horizontal_flip"] = {
                        "direction": direction,
                        "applied_to": "both",
                    }

                elif method == AugmentationMethod.JITTER:
                    # Apply jitter (noise) to INPUT ONLY
                    # Random distribution per sample (A: random from checked options)
                    # Use default values if aug_config is None
                    jitter_distributions = (
                        aug_config.jitter_distributions
                        if aug_config
                        else ["gaussian", "uniform", "laplace"]
                    )
                    jitter_noise_factor = (
                        aug_config.jitter_noise_factor if aug_config else 0.02
                    )
                    distribution = np.random.choice(jitter_distributions)
                    # Apply jitter - only seismic is modified, labels stay clean
                    seismic_4d, _ = jitter(
                        seismic_4d,
                        label_3d,  # Passed but not modified
                        noise_factor=jitter_noise_factor,
                        distribution=distribution,
                    )
                    methods_used.append(method)
                    params["jitter"] = {
                        "noise_factor": jitter_noise_factor,
                        "distribution": distribution,
                        "applied_to": "input_only",
                        "note": "Labels remain unchanged",
                    }

            # Flatten back to 1D for saving
            seismic_flat = seismic_4d.reshape(-1)
            label_flat = label_3d.reshape(-1)

            # Ensure same length as original (pad if needed due to interpolation effects)
            if len(seismic_flat) < len(seismic):
                seismic_flat = np.pad(
                    seismic_flat, (0, len(seismic) - len(seismic_flat)), mode="edge"
                )
            else:
                seismic_flat = seismic_flat[: len(seismic)]

            if len(label_flat) < len(label):
                label_flat = np.pad(
                    label_flat, (0, len(label) - len(label_flat)), mode="edge"
                )
            else:
                label_flat = label_flat[: len(label)]

            return (
                seismic_flat.astype(np.float32),
                label_flat.astype(np.float32),
                methods_used,
                params,
            )

        except Exception as e:
            print(f"DEBUG: Augmentation failed: {e}")
            import traceback

            traceback.print_exc()
            # Return original data if augmentation fails
            return seismic, label, [], {"error": str(e)}

    def delete_augmentation(self, job_id: str) -> bool:
        """Delete augmented data for a job."""
        job = self.jobs.get(job_id)
        if not job:
            return False

        try:
            # Get dataset
            storage = get_storage_service()
            dataset = storage.get_run(job.dataset_id)
            if not dataset:
                from server.services.dataset_service import dataset_service

                dataset = dataset_service.get_dataset(job.dataset_id)

            if not dataset or not dataset.output_path:
                return False

            output_path = Path(dataset.output_path)

            # Load augmentation metadata to know which files to delete
            metadata_path = self._get_augmentation_metadata_path(dataset.output_path)
            if metadata_path.exists():
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)

                # Delete augmented files
                for sample_info in metadata.get("samples", []):
                    idx = sample_info["index"]
                    filename = f"{idx:06d}.dat"

                    seismic_file = output_path / "seismic" / filename
                    label_file = output_path / "label" / filename

                    if seismic_file.exists():
                        seismic_file.unlink()
                    if label_file.exists():
                        label_file.unlink()

                # Delete metadata file
                metadata_path.unlink()

            # Update dataset metadata
            dataset_metadata_path = output_path / "metadata.json"
            if dataset_metadata_path.exists():
                with open(dataset_metadata_path, "r", encoding="utf-8") as f:
                    dataset_meta = json.load(f)

                # Restore original sample count
                if "augmentation" in dataset_meta:
                    total_aug = dataset_meta["augmentation"].get("total_augmented", 0)
                    dataset_meta["sample_counts"]["train"] -= total_aug
                    del dataset_meta["augmentation"]

                with open(dataset_metadata_path, "w", encoding="utf-8") as f:
                    json.dump(dataset_meta, f, indent=2, default=str)

            # Remove job from memory
            del self.jobs[job_id]

            return True

        except Exception as e:
            print(f"Failed to delete augmentation: {e}")
            return False


# Global service instance
augmentation_service = AugmentationService()
