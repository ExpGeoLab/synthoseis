# Dataset Creation and Augmentation Documentation

## Overview

The SynToSeis Dataset Pipeline enables creation of training datasets from synthetic seismic volumes for deep learning model training. The pipeline supports automatic data augmentation to increase dataset diversity and improve model generalization.

## Table of Contents

1. [Dataset Creation](#dataset-creation)
2. [Data Format](#data-format)
3. [Augmentation](#augmentation)
4. [API Reference](#api-reference)
5. [Usage Examples](#usage-examples)
6. [Troubleshooting](#troubleshooting)

---

## Dataset Creation

### Pipeline Flow

```
Source Runs → Volume Collection → Patch Extraction → Train/Val Split → SFM Format → (Optional) Augmentation
```

### 1. Source Selection

Select completed SynToSeis runs to extract volumes from. The system:
- Scans run output folders for `.npy` volume files
- Filters volumes based on task type:
  - **Denoise**: Seismic volumes (seismic, RFC, cumsum)
  - **Reflection**: Impedance volumes (vp, rho, velocity, density)
  - **Other tasks**: All available volumes

### 2. Patch Configuration

Configure how patches are extracted from volumes:

| Parameter | Description | Default | Notes |
|-----------|-------------|---------|-------|
| `size_x` | Patch width in X dimension | 48 | Must be ≤ volume X dimension |
| `size_y` | Patch height in Y dimension | 48 | Must be ≤ volume Y dimension |
| `size_z` | Patch depth in Z dimension | 1 | Typically 1 for 2D training |
| `extraction_mode` | How patches are extracted | "random" | Options: random, grid |
| `num_patches_per_volume` | Patches to extract per volume | 10 | Higher = more training data |
| `overlap` | Overlap between grid patches | 0.0 | 0.0-1.0 for grid mode |

**Important**: Patch dimensions must be smaller than or equal to the source volume dimensions. For example, if your volumes are 50×50×1259, use patch sizes of 48×48×1 or smaller.

### 3. Task Types

Different tasks require different input/output configurations:

| Task | Input | Target | Volume Filter |
|------|-------|--------|---------------|
| **Denoise** | Seismic with noise | Clean seismic | seismic, RFC, cumsum |
| **Reflection** | Acoustic Impedance | Reflectivity Coefficients | vp, rho, impedance |
| **Facies** | Seismic | Facies classes | All seismic volumes |
| **Salt** | Seismic | Salt mask | All seismic volumes |
| **Interpolation** | Sparse seismic | Full seismic | All seismic volumes |

### 4. Train/Validation Split

Configure the split between training and validation data:
- Default: 80% training, 20% validation
- Adjustable via slider (50-90% training)
- Deterministic based on random seed

### 5. Processing Steps

1. **Collect Volumes**: Gather `.npy` files from selected runs
2. **Extract Patches**: Cut patches according to configuration
3. **Split Data**: Randomly assign to train/validation sets
4. **Normalize** (optional): Apply Z-score or Min-Max normalization
5. **Save as SFM Format**: Convert to float32 `.dat` binary files
6. **Generate Metadata**: Create dataset information files

---

## Data Format

### Directory Structure

```
datasets/
└── {dataset_name}_{timestamp}/
    ├── metadata.json              # Dataset configuration and statistics
    ├── README.md                  # Human-readable documentation
    ├── augmentation_metadata.json # (if augmented) Augmentation tracking
    ├── seismic/                   # Training input data
    │   ├── 000000.dat            # Original samples
    │   ├── 000001.dat
    │   └── 0000XX.dat            # Augmented samples (if enabled)
    ├── label/                     # Training labels
    │   ├── 000000.dat
    │   ├── 000001.dat
    │   └── 0000XX.dat
    └── val/
        ├── seismic/               # Validation input
        │   ├── 000000.dat
        │   └── 000001.dat
        └── label/                 # Validation labels
            ├── 000000.dat
            └── 000001.dat
```

### File Format (.dat)

- **Type**: Binary float32 array
- **Structure**: Flattened 3D array (size_x × size_y × size_z)
- **Naming**: Sequential 6-digit zero-padded (000000.dat, 000001.dat, ...)
- **Size**: Each file contains `size_x × size_y × size_z` float32 values

### Metadata Schema

**metadata.json**:
```json
{
  "id": "uuid-string",
  "name": "dataset_name",
  "status": "completed",
  "task_type": "denoise",
  "config": {
    "patch_config": {
      "size_x": 48,
      "size_y": 48,
      "size_z": 1,
      "extraction_mode": "random",
      "num_patches_per_volume": 10
    },
    "train_split": 0.8,
    "val_split": 0.2,
    "normalize": true,
    "normalization_method": "standard",
    "augmentation": {
      "enabled": true,
      "methods": ["tz_stretch", "uniform_stretch"],
      "augment_factor": 2
    }
  },
  "sample_counts": {
    "train": 1000,
    "validation": 200
  },
  "augmentation": {
    "enabled": true,
    "job_id": "uuid",
    "total_augmented": 500
  }
}
```

**augmentation_metadata.json**:
```json
{
  "job_id": "uuid-string",
  "dataset_id": "uuid-string",
  "created_at": "2026-03-06T10:30:00",
  "config": {
    "methods": ["horizontal_flip", "tz_stretch", "jitter"],
    "augment_factor": 2,
    "jitter_noise_factor": 0.02,
    "jitter_distributions": ["gaussian", "uniform", "laplace"],
    "flip_direction": "random"
  },
  "samples": [
    {
      "index": 100,
      "original_index": 0,
      "methods_applied": ["horizontal_flip", "tz_stretch", "jitter"],
      "parameters": {
        "horizontal_flip": {
          "direction": "both",
          "applied_to": "both"
        },
        "tz_stretch": {
          "water_bottom_mean": 10.5,
          "squeeze_depth": 35.2
        },
        "jitter": {
          "noise_factor": 0.02,
          "distribution": "laplace",
          "applied_to": "input_only",
          "note": "Labels remain unchanged"
        }
      }
    }
  ],
  "total_augmented": 500
}
```

---

## Augmentation

### Overview

Augmentation generates additional training samples by applying geometric transformations to existing patches. This increases dataset diversity and helps models generalize better.

**Key Features**:
- Automatic trigger after dataset creation (if enabled)
- Manual trigger for existing datasets
- Training data only (validation remains unchanged)
- Multiple methods can be chained
- Separate metadata tracking for reproducibility

### Augmentation Methods

#### 1. Time-Depth Stretch (TZ Stretch)

Simulates time-depth conversion effects by applying stretch/squeeze along the depth (Z) axis.

**Algorithm**:
- Uses spline-based interpolation (`UnivariateSpline`)
- Accounts for seafloor depth variations
- Triangular distribution for squeeze depth: `triangular(min, mode, max)`
- Triangular distribution for squeeze percentage: `triangular(1.05, 1.15, 1.25)`

**Implementation**:
```python
from datagenerator.Augmentation import tz_stretch

# Water bottom (seafloor) map
wb = uniform_filter(water_bottom, size=(31, 31))

# Apply stretch
seismic_augmented, labels_augmented = tz_stretch(
    seismic_cube,      # 4D: (angles, x, y, z)
    labels_cube,       # 3D: (x, y, z)
    wb                 # 2D: (x, y) seafloor depth
)
```

**Effects**:
- Stretches/squeezes traces at different depths
- Simulates velocity model variations
- Spatially varying (different for each location based on seafloor)

#### 2. Uniform Stretch

Applies independent stretch/squeeze factors to X, Y, and Z dimensions.

**Algorithm**:
- Random squeeze factors for each dimension: `uniform(0.85, 1.15)`
- Interpolates along each axis using `np.interp`
- Rolls arrays to handle boundary expansion
- Preserves integer labels by rounding

**Implementation**:
```python
from datagenerator.Augmentation import uniform_stretch

# Apply uniform stretch
seismic_augmented, labels_augmented = uniform_stretch(
    seismic_cube,      # 4D: (angles, x, y, z)
    labels_cube        # 3D: (x, y, z)
)
```

**Effects**:
- Geometric distortion in all dimensions
- Simulates acquisition geometry variations
- Independent control per dimension

#### 3. Flip (Horizontal/Vertical)

Mirrors data along spatial axes to increase geometric diversity. Randomly chooses between horizontal, vertical, or both flips per sample.

**Algorithm**:
- Random direction selection per sample: `random.choice(['horizontal', 'vertical', 'both'])`
- Horizontal flip: Mirrors along X axis (axis=1 for 4D seismic, axis=0 for 3D labels)
- Vertical flip: Mirrors along Y axis (axis=2 for 4D seismic, axis=1 for 3D labels)
- Both: Applies both flips sequentially

**Implementation**:
```python
from datagenerator.Augmentation import horizontal_flip

# Apply flip with random direction
seismic_augmented, labels_augmented = horizontal_flip(
    seismic_cube,      # 4D: (angles, x, y, z)
    labels_cube,       # 3D: (x, y, z)
    flip_direction='random'  # Options: 'random', 'horizontal', 'vertical', 'both'
)
```

**Configuration**:
| Parameter | Description | Default | Options |
|-----------|-------------|---------|---------|
| `flip_direction` | Direction of flip | "random" | random, horizontal, vertical, both |

**Effects**:
- Creates mirror images of patches
- Helps model learn orientation-invariant features
- Applied to both input and labels identically

#### 4. Jitter (Noise Injection)

Adds random noise to input data to make training harder and prevent overfitting. **Important**: Jitter is applied to INPUT ONLY - labels remain clean for accurate training targets.

**Algorithm**:
- Random distribution selection per sample: `random.choice(['gaussian', 'uniform', 'laplace'])`
- Noise scale: `noise_factor * std(signal)` (configurable 0.01% to 50%)
- Three distribution types:
  - **Gaussian**: Normal distribution, good for subtle variations
  - **Uniform**: Even distribution across range
  - **Laplace**: Heavy tails, creates more extreme outliers

**Implementation**:
```python
from datagenerator.Augmentation import jitter

# Apply jitter with 2% noise level
seismic_noised, labels_unchanged = jitter(
    seismic_cube,      # 4D: Will be modified
    labels_cube,       # 3D: Will remain unchanged!
    noise_factor=0.02, # 2% of signal std
    distribution='random'  # Options: 'random', 'gaussian', 'uniform', 'laplace'
)
```

**Configuration**:
| Parameter | Description | Default | Range |
|-----------|-------------|---------|-------|
| `jitter_noise_factor` | Noise magnitude as % of signal std | 0.02 (2%) | 0.0001 (0.01%) to 0.50 (50%) |
| `jitter_distributions` | Available noise distributions | ["gaussian", "uniform", "laplace"] | Any combination |

**Noise Level Guidelines**:
- **0.01% - 1.0%**: Subtle variations (subtle)
- **1.0% - 5.0%**: Moderate difficulty (default: 2%)
- **5.0% - 50.0%**: High noise (extreme)

**Effects**:
- Prevents model memorization of exact patterns
- Improves generalization to noisy real-world data
- Input becomes "harder" while targets remain clean
- Random distribution per sample increases diversity

### Augmentation Configuration

| Parameter | Description | Default | Range |
|-----------|-------------|---------|-------|
| `enabled` | Enable augmentation | false | true/false |
| `methods` | List of methods to apply | ["tz_stretch"] | tz_stretch, uniform_stretch, horizontal_flip, jitter |
| `augment_factor` | Multiplier for training samples | 2 | 1-5 |
| `apply_to_train_only` | Only augment training data | true | true/false |
| `seed` | Random seed for reproducibility | 42 | any integer |
| `jitter_noise_factor` | Jitter noise as % of signal std | 0.02 (2%) | 0.0001 to 0.50 (0.01% to 50%) |
| `jitter_distributions` | Available noise distributions | ["gaussian", "uniform", "laplace"] | Any combination |
| `flip_direction` | Flip direction preference | "random" | random, horizontal, vertical, both |

### Method Sequencing

When multiple augmentation methods are selected, they are applied **sequentially** in the following order:

1. **Horizontal Flip** (geometric transformation)
2. **TZ Stretch** (depth-wise transformation)
3. **Uniform Stretch** (volumetric transformation)
4. **Jitter** (noise injection - applied last)

**Example with all methods enabled**:
```
Original → Flip → TZ Stretch → Uniform Stretch → Jitter → Final
```

This sequencing ensures:
- Geometric transformations happen before noise injection
- Jitter is applied last so noise isn't amplified by subsequent transforms
- Each method builds upon the previous transformations
- Random choices (flip direction, noise distribution) are made per sample

**Important Notes**:
- **Flip**: Random direction chosen per sample (horizontal/vertical/both)
- **Jitter**: Random distribution chosen per sample from enabled options
- **Jitter**: Applied to INPUT ONLY - labels remain clean!
- All other methods: Applied to both input and labels

### How It Works

1. **Original Dataset Created**:
   ```
   seismic/: 000000.dat, 000001.dat, ..., 000499.dat (500 samples)
   label/:  000000.dat, 000001.dat, ..., 000499.dat
   ```

2. **Augmentation Applied** (factor=2):
   ```
   seismic/: 000000.dat, ..., 000499.dat (original)
             000500.dat, ..., 000999.dat (augmented)
   label/:  000000.dat, ..., 000499.dat (original)
             000500.dat, ..., 000999.dat (augmented)
   ```

3. **Naming Convention**:
   - Original samples: 000000 - 000499
   - Augmented samples: 000500 - 000999 (continues sequence)
   - Each augmented file tracks its parent via `original_index`

### Storage Strategy

- **Mixed Storage**: Augmented samples saved in same folders as originals
- **Separate Tracking**: `augmentation_metadata.json` tracks which samples are augmented
- **Metadata Update**: Original `metadata.json` updated with augmentation stats
- **Reversible**: Can delete augmentation to restore original dataset

---

## API Reference

### Dataset Endpoints

#### Create Dataset
```http
POST /api/datasets
Content-Type: application/json

{
  "name": "my_dataset",
  "task_type": "denoise",
  "source_run_ids": ["run_abc123"],
  "patch_config": {
    "size_x": 48,
    "size_y": 48,
    "size_z": 1,
    "extraction_mode": "random",
    "num_patches_per_volume": 10
  },
  "augmentation": {
    "enabled": true,
    "methods": ["tz_stretch"],
    "augment_factor": 2
  }
}
```

#### List Datasets
```http
GET /api/datasets
```

#### Get Dataset
```http
GET /api/datasets/{dataset_id}
```

#### Delete Dataset
```http
DELETE /api/datasets/{dataset_id}
```

### Augmentation Endpoints

#### Start Augmentation
```http
POST /api/datasets/{dataset_id}/augment
Content-Type: application/json

{
  "enabled": true,
  "methods": ["tz_stretch", "uniform_stretch"],
  "augment_factor": 2,
  "apply_to_train_only": true,
  "seed": 42
}
```

#### Get Augmentation Status
```http
GET /api/datasets/{dataset_id}/augment/status
```

**Response**:
```json
{
  "status": "completed",
  "jobs": [
    {
      "id": "job_uuid",
      "dataset_id": "dataset_uuid",
      "status": "completed",
      "samples_processed": 1000,
      "total_samples": 1000
    }
  ]
}
```

#### List All Augmentation Jobs
```http
GET /api/augment/jobs
```

#### Delete Augmentation
```http
DELETE /api/augment/jobs/{job_id}
```

---

## Usage Examples

### Example 1: Create Dataset with Auto-Augmentation

```bash
# Create a denoising dataset with automatic augmentation
curl -X POST http://localhost:8000/api/datasets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "denoise_dataset_v1",
    "task_type": "denoise",
    "source_run_ids": ["run_abc123"],
    "patch_config": {
      "size_x": 48,
      "size_y": 48,
      "size_z": 1,
      "extraction_mode": "random",
      "num_patches_per_volume": 20
    },
    "train_split": 0.8,
    "normalize": true,
    "augmentation": {
      "enabled": true,
      "methods": ["tz_stretch", "uniform_stretch"],
      "augment_factor": 2
    }
  }'
```

**Result**: Creates dataset with 1000 training samples, then automatically generates 2000 augmented samples (total 3000 training samples).

### Example 2: Manual Augmentation of Existing Dataset

```bash
# Start augmentation on an existing dataset
curl -X POST http://localhost:8000/api/datasets/existing_dataset_id/augment \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "methods": ["tz_stretch"],
    "augment_factor": 3
  }'
```

### Example 3: Python Client

```python
import requests
import numpy as np

# Create dataset
response = requests.post("http://localhost:8000/api/datasets", json={
    "name": "reflection_dataset",
    "task_type": "reflection",
    "source_run_ids": ["run_xyz789"],
    "patch_config": {
        "size_x": 48,
        "size_y": 48,
        "size_z": 1,
        "num_patches_per_volume": 15
    },
    "augmentation": {
        "enabled": True,
        "methods": ["tz_stretch"],
        "augment_factor": 2
    }
})

dataset = response.json()
print(f"Dataset created: {dataset['id']}")
print(f"Status: {dataset['status']}")

# Monitor progress
import time
while True:
    status = requests.get(
        f"http://localhost:8000/api/datasets/{dataset['id']}"
    ).json()
    
    print(f"Progress: {status['progress']}%, Step: {status['current_step']}")
    
    if status['status'] in ['completed', 'failed']:
        break
    
    time.sleep(2)

# Load and use data
data = np.fromfile(
    f"datasets/{dataset['name']}_{dataset['created_at']}/seismic/000000.dat",
    dtype=np.float32
)
data = data.reshape(48, 48, 1)  # Reshape to 3D
```

### Example 4: Check Augmentation Status

```python
# Get augmentation status for a dataset
response = requests.get(
    "http://localhost:8000/api/datasets/dataset_id/augment/status"
)

status = response.json()
print(f"Augmentation Status: {status['status']}")

for job in status['jobs']:
    print(f"  Job {job['id']}: {job['samples_processed']}/{job['total_samples']} samples")
```

---

## Troubleshooting

### Common Issues

#### 1. "No volumes found in source runs"

**Cause**: Selected runs don't have matching volume types for the task.

**Solution**:
- Check run output folders for `.npy` files
- For Denoise: Ensure seismic volumes exist
- For Reflection: Ensure impedance volumes (vp, rho) exist

#### 2. "Volume too small for patches"

**Cause**: Patch size larger than volume dimensions.

**Solution**:
- Check volume shape in output folder
- Reduce patch size (e.g., from 224×224 to 48×48)
- Use grid mode with smaller patches

#### 3. "Mismatch: X seismic files, Y label files"

**Cause**: Dataset corrupted or incomplete.

**Solution**:
- Delete dataset and recreate
- Check disk space
- Verify file permissions

#### 4. Augmentation fails with "array shape mismatch"

**Cause**: Patch shape in metadata doesn't match actual file size.

**Solution**:
- Service auto-detects actual shape
- Check dataset metadata for patch_config
- Verify .dat file sizes are consistent

### Debug Mode

Enable verbose logging by checking server console output:

```
DEBUG: Starting augmentation of 500 samples with factor 2
DEBUG: Patch shape: (48, 48, 1), total elements: 2304
DEBUG: Augmented 10/1000 samples
```

### Performance Tips

1. **Patch Size**: Smaller patches = faster processing, but less context
2. **Augmentation Factor**: Higher factor = more data, but longer processing
3. **Methods**: TZ stretch is slower than uniform stretch due to spline interpolation
4. **Volume Selection**: Filter volumes by task type to reduce processing time

### Best Practices

1. **Always enable augmentation** for training datasets
2. **Use augment_factor=2 or 3** for good balance
3. **Combine both methods** (tz_stretch + uniform_stretch) for maximum diversity
4. **Keep validation data unaugmented** (apply_to_train_only=true)
5. **Use consistent seed** for reproducibility across runs
6. **Monitor progress** via API or UI before starting training

---

## Integration with SFM Training

Once dataset is created, use with SFM-Finetune:

```bash
python main_finetune.py \
    --task denoise \
    --data_path datasets/my_dataset_20260306_123456 \
    --finetune pretrained_model.pth \
    --batch_size 32 \
    --epochs 100
```

The dataset structure is compatible with SFM's expected format:
- `seismic/`: Input data
- `label/`: Target data
- `val/seismic/`: Validation input
- `val/label/`: Validation target

---

## Additional Resources

- **API Docs**: http://localhost:8000/docs (when server is running)
- **Source Code**:
  - Dataset Service: `server/services/dataset_service.py`
  - Augmentation Service: `server/services/augmentation_service.py`
  - Augmentation Algorithms: `datagenerator/Augmentation.py`
- **Frontend UI**: Access via web browser at http://localhost:5173

---

## Changelog

### Version 1.0 (2026-03-06)
- Initial dataset creation pipeline
- Support for 5 task types (Denoise, Facies, Salt, Interpolation, Reflection)
- Automatic volume filtering by task
- Train/validation splitting
- SFM-compatible .dat format output

### Version 1.1 (2026-03-06)
- Added augmentation pipeline
- TZ stretch and uniform stretch methods
- Auto-trigger after dataset creation
- Manual augmentation for existing datasets
- Separate augmentation metadata tracking
- Integration with Dashboard metrics
