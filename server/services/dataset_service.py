"""Dataset service for creating SFM-compatible training datasets."""

import os
import sys
import json
import uuid
import glob
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Fix encoding for Windows console
if sys.platform == "win32":
    import io

    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from server.models.schemas import (
    DatasetConfig,
    DatasetResponse,
    DatasetStatus,
    DatasetTaskType,
    DatasetSampleCounts,
    PatchConfig,
)
from server.services.storage import get_storage_service


class DatasetService:
    """Service for creating and managing datasets."""

    def __init__(self, data_dir: str = "datasets"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True)
        self.datasets: Dict[str, DatasetResponse] = {}
        self._executor = ThreadPoolExecutor(max_workers=2)
        self._load_existing_datasets()

    def _load_existing_datasets(self):
        """Load existing datasets from disk."""
        for dataset_dir in self.data_dir.iterdir():
            if dataset_dir.is_dir():
                metadata_file = dataset_dir / "metadata.json"
                if metadata_file.exists():
                    try:
                        with open(metadata_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            dataset = DatasetResponse(**data)
                            self.datasets[dataset.id] = dataset
                    except Exception as e:
                        print(f"Failed to load dataset {dataset_dir.name}: {e}")

    def _get_default_output_path(self, name: str) -> str:
        """Get default output path for a dataset."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return str(self.data_dir / f"{name}_{timestamp}")

    def _save_dataset_metadata(self, dataset: DatasetResponse):
        """Save dataset metadata to disk."""
        if dataset.output_path:
            output_path = Path(dataset.output_path)
            output_path.mkdir(parents=True, exist_ok=True)
            metadata_file = output_path / "metadata.json"
            with open(metadata_file, "w", encoding="utf-8") as f:
                json.dump(dataset.dict(), f, indent=2, default=str)

    def list_datasets(self) -> List[DatasetResponse]:
        """List all datasets."""
        return sorted(self.datasets.values(), key=lambda x: x.created_at, reverse=True)

    def get_dataset(self, dataset_id: str) -> Optional[DatasetResponse]:
        """Get a dataset by ID."""
        return self.datasets.get(dataset_id)

    async def create_dataset(self, config: DatasetConfig) -> DatasetResponse:
        """Create a new dataset."""
        dataset_id = str(uuid.uuid4())

        # Set default output path if not provided
        if not config.output_path:
            config.output_path = self._get_default_output_path(config.name)

        dataset = DatasetResponse(
            id=dataset_id,
            name=config.name,
            status=DatasetStatus.PENDING,
            task_type=config.task_type,
            config=config,
            created_at=datetime.now(),
            output_path=config.output_path,
            progress=0,
            current_step="Initializing",
        )

        self.datasets[dataset_id] = dataset
        self._save_dataset_metadata(dataset)

        # Start processing in background
        asyncio.create_task(self._process_dataset(dataset_id))

        return dataset

    def delete_dataset(self, dataset_id: str) -> bool:
        """Delete a dataset."""
        dataset = self.datasets.get(dataset_id)
        if not dataset:
            return False

        # Remove from memory
        del self.datasets[dataset_id]

        # Remove from disk
        if dataset.output_path:
            output_path = Path(dataset.output_path)
            if output_path.exists():
                import shutil

                shutil.rmtree(output_path)

        return True

    async def _process_dataset(self, dataset_id: str):
        """Process a dataset in the background."""
        dataset = self.datasets.get(dataset_id)
        if not dataset:
            return

        try:
            dataset.status = DatasetStatus.PROCESSING
            dataset.current_step = "Collecting volumes"
            self._save_dataset_metadata(dataset)

            # Collect volumes from source runs
            volumes = await self._collect_volumes(
                dataset.config.source_run_ids, dataset.config.task_type
            )

            if not volumes:
                raise ValueError("No volumes found in source runs")

            print(f"DEBUG: Found {len(volumes)} volumes")
            for vol in volumes:
                print(
                    f"DEBUG: Volume: {vol['name']} at {vol['path']} with shape {vol['shape']}"
                )

            # Create output directory structure
            output_path = Path(dataset.config.output_path)
            train_seismic_path = output_path / "seismic"
            val_seismic_path = output_path / "val" / "seismic"
            train_label_path = output_path / "label"
            val_label_path = output_path / "val" / "label"

            train_seismic_path.mkdir(parents=True, exist_ok=True)
            val_seismic_path.mkdir(parents=True, exist_ok=True)
            train_label_path.mkdir(parents=True, exist_ok=True)
            val_label_path.mkdir(parents=True, exist_ok=True)

            dataset.current_step = "Extracting and processing patches"
            dataset.progress = 20
            self._save_dataset_metadata(dataset)

            # Log patch configuration
            pc = dataset.config.patch_config
            print(
                f"DEBUG: Patch config - size: {pc.size_x}x{pc.size_y}x{pc.size_z}, mode: {pc.extraction_mode}, patches per volume: {pc.num_patches_per_volume}"
            )
            print(f"DEBUG: Processing {len(volumes)} volumes for patch extraction")

            # Extract patches from all volumes
            all_patches = []
            for vol in volumes:
                try:
                    print(
                        f"DEBUG: Processing volume: {vol['name']} with shape {vol['shape']}"
                    )
                    patches = await self._extract_patches_from_volume(
                        vol, dataset.config.patch_config
                    )
                    all_patches.extend(patches)
                    print(f"DEBUG: Extracted {len(patches)} patches from {vol['name']}")
                except Exception as e:
                    print(f"DEBUG: Failed to extract from {vol['name']}: {e}")
                    import traceback

                    print(f"DEBUG: Traceback: {traceback.format_exc()}")
                    continue

            if not all_patches:
                raise ValueError("No patches could be extracted from volumes")

            dataset.current_step = "Splitting train/validation"
            dataset.progress = 60
            self._save_dataset_metadata(dataset)

            # Split into train/validation
            train_patches, val_patches = self._split_patches(
                all_patches, dataset.config.train_split, dataset.config.seed
            )

            print(
                f"DEBUG: Train patches: {len(train_patches)}, Val patches: {len(val_patches)}"
            )

            dataset.current_step = "Saving to SFM format"
            dataset.progress = 80
            self._save_dataset_metadata(dataset)

            # Save patches as float32 .dat files
            await self._save_patches_as_dat(
                train_patches,
                train_seismic_path,
                train_label_path,
                dataset.config.normalize,
                dataset.config.normalization_method,
                dataset.config.task_type,
            )

            await self._save_patches_as_dat(
                val_patches,
                val_seismic_path,
                val_label_path,
                dataset.config.normalize,
                dataset.config.normalization_method,
                dataset.config.task_type,
            )

            # Update dataset status
            dataset.status = DatasetStatus.COMPLETED
            dataset.completed_at = datetime.now()
            dataset.progress = 100
            dataset.current_step = "Completed"
            dataset.sample_counts = DatasetSampleCounts(
                train=len(train_patches), validation=len(val_patches)
            )

            # Create README
            self._create_readme(dataset, output_path)

            # Trigger auto-augmentation if enabled
            if dataset.config.augmentation.enabled:
                print(
                    f"DEBUG: Auto-augmentation enabled, starting augmentation pipeline..."
                )
                try:
                    from server.services.augmentation_service import (
                        augmentation_service,
                    )

                    # Start augmentation in background without awaiting
                    asyncio.create_task(
                        augmentation_service.augment_dataset(
                            dataset.id, dataset.config.augmentation
                        )
                    )
                    print(f"DEBUG: Augmentation job started for dataset {dataset.id}")
                except Exception as aug_error:
                    print(f"DEBUG: Failed to start auto-augmentation: {aug_error}")
                    # Don't fail the dataset creation if augmentation fails

            print(f"DEBUG: Dataset creation completed. Output: {output_path}")

        except Exception as e:
            dataset.status = DatasetStatus.FAILED
            import traceback

            error_details = traceback.format_exc()
            dataset.error_message = f"{str(e)}\n\nDetailed traceback:\n{error_details}"
            dataset.current_step = f"Failed at: {dataset.current_step}"
            print(f"Dataset processing failed: {e}")
            print(f"Full traceback:\n{error_details}")

        self._save_dataset_metadata(dataset)

    async def _collect_volumes(
        self, run_ids: List[str], task_type: DatasetTaskType
    ) -> List[Dict[str, Any]]:
        """Collect volumes from source runs."""
        volumes = []
        storage = get_storage_service()

        # Define volume filters based on task type
        if task_type == DatasetTaskType.REFLECTION:
            # For reflection task, look for impedance-related volumes
            allowed_patterns = ["impedance", "vp", "rho", "velocity", "density"]
            print(
                f"DEBUG: Reflection task - filtering for impedance volumes: {allowed_patterns}"
            )
        elif task_type == DatasetTaskType.DENOISE:
            # For denoise task, look for seismic volumes
            allowed_patterns = ["seismic", "RFC", "cumsum", "noise"]
            print(
                f"DEBUG: Denoise task - filtering for seismic volumes: {allowed_patterns}"
            )
        else:
            # For other tasks, accept all volumes
            allowed_patterns = None
            print(f"DEBUG: {task_type.value} task - accepting all volumes")

        for run_id in run_ids:
            run = storage.get_run(run_id)
            if not run or not run.output_folder:
                print(f"DEBUG: Run {run_id} not found or has no output folder")
                continue

            output_folder = run.output_folder
            print(f"DEBUG: Looking for volumes in: {output_folder}")

            # Find all .npy files in the output folder
            if os.path.exists(output_folder):
                npy_files = glob.glob(os.path.join(output_folder, "*.npy"))
                print(f"DEBUG: Found {len(npy_files)} .npy files")

                for npy_file in npy_files:
                    try:
                        filename = os.path.basename(npy_file)

                        # Filter volumes based on task type
                        if allowed_patterns:
                            if not any(
                                pattern.lower() in filename.lower()
                                for pattern in allowed_patterns
                            ):
                                print(
                                    f"DEBUG: Skipping {filename} - doesn't match task patterns"
                                )
                                continue

                        # Use mmap_mode to get shape without loading full data
                        data = np.load(npy_file, mmap_mode="r")
                        vol_info = {
                            "run_id": run_id,
                            "name": filename.replace(".npy", ""),
                            "filename": filename,
                            "path": npy_file,
                            "shape": list(data.shape),
                        }
                        volumes.append(vol_info)
                        print(
                            f"DEBUG: Added volume: {vol_info['name']} with shape {vol_info['shape']}"
                        )
                    except Exception as e:
                        print(f"DEBUG: Error loading {npy_file}: {e}")
                        continue
            else:
                print(f"DEBUG: Output folder does not exist: {output_folder}")

        return volumes

    async def _extract_patches_from_volume(
        self, volume: Dict[str, Any], patch_config: PatchConfig
    ) -> List[Dict[str, Any]]:
        """Extract patches from a single volume."""
        patches = []

        # Load the volume data
        volume_data = np.load(volume["path"])
        shape = volume_data.shape

        print(f"DEBUG: Extracting from volume {volume['name']} with shape {shape}")

        # Handle different volume dimensions
        if len(shape) == 2:
            # 2D volume: reshape to (1, X, Y) to treat as single slice
            volume_data = volume_data.reshape((1, shape[0], shape[1]))
            shape = volume_data.shape
        elif len(shape) == 3:
            # 3D volume: (X, Y, Z)
            pass
        elif len(shape) == 4:
            # 4D volume (e.g., angle stacks): take first angle for now
            volume_data = volume_data[0]
            shape = volume_data.shape
        else:
            print(f"DEBUG: Unsupported volume shape: {shape}")
            return patches

        nx, ny, nz = shape
        px, py, pz = patch_config.size_x, patch_config.size_y, patch_config.size_z

        # Check if volume is large enough for patches
        if nx < px or ny < py or nz < pz:
            print(
                f"DEBUG: Volume {volume['name']} too small for patches: volume shape {shape} < patch size ({px}, {py}, {pz})"
            )
            print(
                f"DEBUG: Volume dimensions must be >= patch size. X: {nx} >= {px}? {nx >= px}, Y: {ny} >= {py}? {ny >= py}, Z: {nz} >= {pz}? {nz >= pz}"
            )
            return patches

        num_patches = patch_config.num_patches_per_volume

        if patch_config.extraction_mode == "random":
            # Random patch extraction
            np.random.seed(patch_config.num_patches_per_volume)  # For reproducibility
            for i in range(num_patches):
                # Random starting position
                x_start = np.random.randint(0, nx - px + 1)
                y_start = np.random.randint(0, ny - py + 1)
                z_start = np.random.randint(0, nz - pz + 1)

                # Extract patch
                patch = volume_data[
                    x_start : x_start + px,
                    y_start : y_start + py,
                    z_start : z_start + pz,
                ]

                patches.append(
                    {
                        "data": patch.copy(),
                        "volume_name": volume["name"],
                        "position": (x_start, y_start, z_start),
                        "shape": patch.shape,
                    }
                )

        elif patch_config.extraction_mode == "grid":
            # Grid-based extraction
            if patch_config.overlap > 0:
                step_x = int(px * (1 - patch_config.overlap))
                step_y = int(py * (1 - patch_config.overlap))
                step_z = int(pz * (1 - patch_config.overlap))
            else:
                step_x, step_y, step_z = px, py, pz

            count = 0
            for x_start in range(0, nx - px + 1, step_x):
                for y_start in range(0, ny - py + 1, step_y):
                    for z_start in range(0, nz - pz + 1, step_z):
                        if count >= num_patches:
                            break

                        patch = volume_data[
                            x_start : x_start + px,
                            y_start : y_start + py,
                            z_start : z_start + pz,
                        ]

                        patches.append(
                            {
                                "data": patch.copy(),
                                "volume_name": volume["name"],
                                "position": (x_start, y_start, z_start),
                                "shape": patch.shape,
                            }
                        )
                        count += 1

        print(f"DEBUG: Extracted {len(patches)} patches from {volume['name']}")
        return patches

    def _split_patches(
        self, patches: List[Dict[str, Any]], train_split: float, seed: int
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Split patches into train and validation sets."""
        np.random.seed(seed)
        indices = np.random.permutation(len(patches))

        split_idx = int(len(patches) * train_split)
        train_indices = indices[:split_idx]
        val_indices = indices[split_idx:]

        train_patches = [patches[i] for i in train_indices]
        val_patches = [patches[i] for i in val_indices]

        return train_patches, val_patches

    async def _save_patches_as_dat(
        self,
        patches: List[Dict[str, Any]],
        seismic_path: Path,
        label_path: Path,
        normalize: bool,
        normalization_method: str,
        task_type: DatasetTaskType,
    ):
        """Save patches as float32 .dat files (SFM format)."""
        print(
            f"DEBUG: Saving {len(patches)} patches to {seismic_path} for task: {task_type.value}"
        )

        for idx, patch in enumerate(patches):
            data = patch["data"].astype(np.float32)

            # Normalize if requested
            if normalize:
                if normalization_method == "standard":
                    # Z-score normalization
                    mean = np.mean(data)
                    std = np.std(data)
                    if std > 0:
                        data = (data - mean) / std
                elif normalization_method == "minmax":
                    # Min-max normalization to [-1, 1]
                    min_val = np.min(data)
                    max_val = np.max(data)
                    if max_val > min_val:
                        data = 2 * (data - min_val) / (max_val - min_val) - 1

            filename = f"{idx:06d}.dat"

            # Task-specific processing
            if task_type == DatasetTaskType.REFLECTION:
                # Reflection task: input is impedance, label is reflectivity
                # Save impedance as input
                seismic_file = seismic_path / filename
                data.tofile(seismic_file)

                # Calculate reflection coefficients (derivative of impedance in Z direction)
                reflectivity = self._calculate_reflectivity(data)
                label_file = label_path / filename
                reflectivity.tofile(label_file)

            elif task_type == DatasetTaskType.DENOISE:
                # Denoise task: input is noisy, label is clean (for now, same data)
                seismic_file = seismic_path / filename
                data.tofile(seismic_file)
                label_file = label_path / filename
                data.tofile(label_file)

            else:
                # Default: save same data for input and label
                seismic_file = seismic_path / filename
                data.tofile(seismic_file)
                label_file = label_path / filename
                data.tofile(label_file)

            if idx % 10 == 0:
                print(f"DEBUG: Saved patch {idx + 1}/{len(patches)}")

    def _calculate_reflectivity(self, impedance: np.ndarray) -> np.ndarray:
        """Calculate reflection coefficients from impedance.

        Reflection coefficient R = (I2 - I1) / (I2 + I1)
        where I1 and I2 are impedances at adjacent depth samples.
        """
        # Ensure we have at least 3D array (add dimensions if needed)
        original_shape = impedance.shape
        if len(original_shape) == 2:
            # 2D: reshape to (X, Y, 1)
            impedance = impedance.reshape((original_shape[0], original_shape[1], 1))

        reflectivity = np.zeros_like(impedance)

        # Calculate reflection coefficients along Z (depth) axis
        if impedance.shape[2] > 1:
            # For interior points: R = (I[i+1] - I[i]) / (I[i+1] + I[i])
            i1 = impedance[:, :, :-1]
            i2 = impedance[:, :, 1:]
            # Avoid division by zero
            denominator = i2 + i1
            rc = np.where(denominator != 0, (i2 - i1) / denominator, 0)
            reflectivity[:, :, 1:] = rc
            print(
                f"DEBUG: Calculated reflectivity for shape {original_shape}, RC range: [{rc.min():.4f}, {rc.max():.4f}]"
            )
        else:
            print(
                f"DEBUG: Warning - Volume has only 1 depth sample, cannot calculate reflection coefficients"
            )

        # Reshape back to original shape if needed
        reflectivity = reflectivity.reshape(original_shape)

        return reflectivity.astype(np.float32)

    def _create_readme(self, dataset: DatasetResponse, output_path: Path):
        """Create a README file for the dataset."""
        readme_content = f"""# {dataset.name}

## Dataset Information
- **Task Type**: {dataset.task_type.value}
- **Created**: {dataset.created_at}
- **Status**: {dataset.status.value}
- **Output Path**: {dataset.output_path}

## Configuration
- **Patch Size**: {dataset.config.patch_config.size_x}x{dataset.config.patch_config.size_y}x{dataset.config.patch_config.size_z}
- **Extraction Mode**: {dataset.config.patch_config.extraction_mode}
- **Train/Val Split**: {dataset.config.train_split}/{dataset.config.val_split}
- **Normalization**: {dataset.config.normalize} ({dataset.config.normalization_method})
- **Source Runs**: {", ".join(dataset.config.source_run_ids)}

## Sample Counts
- **Training Samples**: {dataset.sample_counts.train}
- **Validation Samples**: {dataset.sample_counts.validation}

## Directory Structure
```
{dataset.name}/
├── seismic/          # Training input data
├── label/           # Training labels
├── val/
│   ├── seismic/     # Validation input data
│   └── label/       # Validation labels
└── metadata.json    # Dataset metadata
```

## Format
All data files are float32 binary files (.dat format) compatible with SFM training.
Each file contains a flattened array of patch data.

## Task-Specific Information
"""

        # Add task-specific documentation
        if dataset.task_type == DatasetTaskType.REFLECTION:
            readme_content += """
### Reflection Task
- **Input**: Acoustic Impedance (vp × rho)
- **Target**: Reflection Coefficients (RC)
- **Calculation**: RC = (I₂ - I₁) / (I₂ + I₁)
  where I₁ and I₂ are impedances at adjacent depth samples
- **Use Case**: Estimate reflectivity from impedance models

**Volume Selection**: Automatically filters for impedance-related volumes 
(vp, rho, velocity, density, impedance)
"""
        elif dataset.task_type == DatasetTaskType.DENOISE:
            readme_content += """
### Denoise Task
- **Input**: Noisy Seismic Data
- **Target**: Clean Seismic Data
- **Use Case**: Remove noise from seismic volumes

**Volume Selection**: Filters for seismic volumes (RFC, cumsum, seismic)
"""
        elif dataset.task_type == DatasetTaskType.FACIES:
            readme_content += """
### Facies Task
- **Input**: Seismic Data
- **Target**: Facies Classification
- **Use Case**: Classify seismic facies
"""

        readme_content += f"""
## Usage
Use this dataset with SFM-Finetune:
```bash
python main_finetune.py \\
    --task {dataset.task_type.value} \\
    --data_path {dataset.output_path} \\
    --finetune <pretrained_checkpoint>
```
"""
        readme_file = output_path / "README.md"
        with open(readme_file, "w", encoding="utf-8") as f:
            f.write(readme_content)


# Global service instance
dataset_service = DatasetService()
