"""Pydantic models for the API."""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ModelConfig(BaseModel):
    """Configuration for a synthoseis model run."""

    project: str = "example"
    project_folder: str = "output/synthoseis_example"
    work_folder: str = "output"
    cube_shape: List[int] = [300, 300, 1250]
    incident_angles: List[int] = [7, 15, 24]
    digi: int = 4
    infill_factor: int = 10
    initial_layer_stdev: List[float] = [7.0, 25.0]
    thickness_min: int = 2
    thickness_max: int = 12
    seabed_min_depth: List[int] = [20, 50]
    signal_to_noise_ratio_db: List[float] = [7.5, 12.5, 17.5]
    bandwidth_low: List[float] = [3.0, 6.0]
    bandwidth_high: List[float] = [20.0, 35.0]
    bandwidth_ord: int = 4
    dip_factor_max: int = 2
    min_number_faults: int = 1
    max_number_faults: int = 6
    pad_samples: int = 10
    max_column_height: List[float] = [150.0, 150.0]
    closure_types: List[str] = ["simple", "faulted", "onlap"]
    min_closure_voxels_simple: int = 500
    min_closure_voxels_faulted: int = 2500
    min_closure_voxels_onlap: int = 500
    sand_layer_thickness: int = 2
    sand_layer_fraction: Dict[str, float] = {"min": 0.05, "max": 0.25}
    extra_qc_plots: bool = True
    verbose: bool = True
    partial_voxels: bool = True
    variable_shale_ng: bool = False
    basin_floor_fans: bool = False
    include_channels: bool = False
    channel_count: List[int] = [1, 2]
    channel_width: List[float] = [80.0, 250.0]
    channel_thickness_scale: float = 1.0
    channel_bin_size: float = 25.0
    include_salt: bool = True
    write_to_hdf: bool = False
    broadband_qc_volume: bool = False
    model_qc_volumes: bool = True
    multiprocess_bp: bool = True


class RunCreate(BaseModel):
    """Request model for creating a new run."""

    config_name: str
    config: ModelConfig
    num_runs: int = 1
    run_id: Optional[str] = None
    test_mode: Optional[int] = None


class RunResponse(BaseModel):
    """Response model for a run."""

    id: str
    config_name: str
    status: RunStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    output_folder: Optional[str] = None
    error_message: Optional[str] = None
    config: ModelConfig
    log_messages: list[str] = []
    progress: int = 0
    current_step: Optional[str] = None


class ConfigSummary(BaseModel):
    """Summary of a saved config."""

    name: str
    created_at: datetime
    updated_at: datetime


class QCImage(BaseModel):
    """QC image information."""

    name: str
    title: str
    description: str
    path: str
    url: str
    thumbnail_url: str


class VolumeInfo(BaseModel):
    """Volume information for visualization."""

    name: str
    filename: str
    shape: List[int]
    path: str
    url: str


class SliceImage(BaseModel):
    """Slice image information."""

    name: str
    volume: str
    slice_index: int
    slice_type: str  # "inline", "crossline", "depth"
    data_url: str


class DashboardStats(BaseModel):
    """Dashboard statistics."""

    total_runs: int
    completed_runs: int
    failed_runs: int
    running_runs: int
    pending_runs: int
    # Dataset metrics
    total_datasets: int
    completed_datasets: int
    total_train_samples: int
    total_val_samples: int


class PolynomialCoeffs(BaseModel):
    """Polynomial coefficients for depth trends: a*z^3 + b*z^2 + c*z + d"""

    a: float = 0.0
    b: float = 0.0
    c: float = 0.0
    d: float = 0.0


class RockTypeProperties(BaseModel):
    """Properties for a rock type (Vp, Vs, Rho as polynomial functions of depth)"""

    vp: PolynomialCoeffs = PolynomialCoeffs()
    vs: PolynomialCoeffs = PolynomialCoeffs()
    rho: PolynomialCoeffs = PolynomialCoeffs()


class RockPhysicsConfig(BaseModel):
    """Rock physics model configuration"""

    name: str = "default"
    shale: RockTypeProperties = RockTypeProperties(
        vp=PolynomialCoeffs(a=-0.00013, b=0, c=1.13, d=1580),
        vs=PolynomialCoeffs(a=-0.0001, b=0, c=0.96, d=279),
        rho=PolynomialCoeffs(a=7.7e-12, b=-8.8e-08, c=0.0004, d=1.957),
    )
    brine_sand: RockTypeProperties = RockTypeProperties(
        vp=PolynomialCoeffs(a=-1.34e-05, b=0, c=0.49, d=2317),
        vs=PolynomialCoeffs(a=-1.0785e-05, b=0, c=0.391, d=1007),
        rho=PolynomialCoeffs(a=-7.8e-09, b=0, c=0.00012, d=2.021),
    )
    oil_sand: RockTypeProperties = RockTypeProperties(
        vp=PolynomialCoeffs(a=-8.876e-06, b=0, c=0.505, d=1998),
        vs=PolynomialCoeffs(a=-1.126e-05, b=0, c=0.391, d=1036),
        rho=PolynomialCoeffs(a=-9.23e-09, b=0, c=0.00014, d=1.916),
    )
    gas_sand: RockTypeProperties = RockTypeProperties(
        vp=PolynomialCoeffs(a=-3.216e-06, b=0, c=0.4796, d=1996),
        vs=PolynomialCoeffs(a=-1.0687e-05, b=0, c=0.3662, d=1135),
        rho=PolynomialCoeffs(a=-1.818e-08, b=0, c=0.000247, d=1.612),
    )


class DatasetTaskType(str, Enum):
    DENOISE = "denoise"
    FACIES = "facies"
    SALT = "salt"
    INTERPOLATION = "interpolation"
    REFLECTION = "reflection"


class DatasetStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class PatchConfig(BaseModel):
    """Configuration for patch extraction."""

    size_x: int = 224
    size_y: int = 224
    size_z: int = 1
    extraction_mode: str = "random"  # "random", "grid", "manual"
    num_patches_per_volume: int = 10
    overlap: float = 0.0  # For grid mode: overlap between patches (0.0-1.0)


# ============ AUGMENTATION MODELS ============


class AugmentationMethod(str, Enum):
    """Available augmentation methods."""

    TZ_STRETCH = "tz_stretch"
    UNIFORM_STRETCH = "uniform_stretch"
    HORIZONTAL_FLIP = "horizontal_flip"
    JITTER = "jitter"


class AugmentationConfig(BaseModel):
    """Configuration for dataset augmentation."""

    enabled: bool = False
    methods: List[AugmentationMethod] = [AugmentationMethod.TZ_STRETCH]
    augment_factor: int = 2  # How many augmented versions per sample
    apply_to_train_only: bool = True
    seed: int = 42
    # Jitter-specific settings
    jitter_noise_factor: float = 0.02  # Default 2%, range 0.0001 (0.01%) to 0.50 (50%)
    jitter_distributions: List[str] = ["gaussian", "uniform", "laplace"]
    # Flip-specific settings
    flip_direction: str = "random"  # 'random', 'horizontal', 'vertical', 'both'


class DatasetConfig(BaseModel):
    """Configuration for creating a dataset."""

    name: str
    task_type: DatasetTaskType = DatasetTaskType.DENOISE
    source_run_ids: List[str] = []  # SynToSeis run IDs
    external_volumes: List[Dict[str, str]] = []  # Phase 2: external files
    patch_config: PatchConfig = PatchConfig()
    train_split: float = 0.8
    val_split: float = 0.2
    normalize: bool = True
    normalization_method: str = "standard"  # "standard", "minmax", "none"
    output_path: Optional[str] = None  # If None, use default
    include_volumes: List[
        str
    ] = []  # Volume types to include (e.g., "seismic_near", "facies")
    augmentation: AugmentationConfig = AugmentationConfig()
    seed: int = 42


class DatasetSampleCounts(BaseModel):
    """Count of samples in each split."""

    train: int = 0
    validation: int = 0


class DatasetResponse(BaseModel):
    """Response model for a dataset."""

    id: str
    name: str
    status: DatasetStatus
    task_type: DatasetTaskType
    config: DatasetConfig
    created_at: datetime
    completed_at: Optional[datetime] = None
    output_path: Optional[str] = None
    sample_counts: DatasetSampleCounts = DatasetSampleCounts()
    progress: int = 0
    current_step: Optional[str] = None
    error_message: Optional[str] = None


class DatasetPreview(BaseModel):
    """Preview of dataset samples."""

    sample_index: int
    split: str  # "train" or "validation"
    input_shape: List[int]
    target_shape: List[int]
    preview_url: str


class SystemSettings(BaseModel):
    """System-wide settings."""

    auto_discover_historic_runs: bool = False
    work_folder: str = "/scratch"
    project_folder: str = "/scratch/synthoseis_example"
    last_discovery_scan: Optional[datetime] = None
    discovered_runs_count: int = 0


class HistoricRunDiscovery(BaseModel):
    """Information about a discovered historic run."""

    run_id: str
    project: str
    date_stamp: str
    output_folder: str
    discovered_at: datetime
    is_test_mode: bool
    volume_count: int = 0


# ============ AUGMENTATION MODELS (continued) ============


class AugmentationStatus(str, Enum):
    """Status of augmentation job."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class AugmentedSampleInfo(BaseModel):
    """Information about an augmented sample."""

    index: int  # File index (e.g., 000100)
    original_index: int  # Which original sample this was derived from
    methods_applied: List[AugmentationMethod]
    parameters: Dict[str, Any] = {}  # Store random parameters used


class AugmentationMetadata(BaseModel):
    """Metadata for augmented data stored separately."""

    job_id: str
    dataset_id: str
    created_at: datetime
    config: AugmentationConfig
    samples: List[AugmentedSampleInfo] = []
    total_augmented: int = 0


class AugmentationJob(BaseModel):
    """Augmentation job response."""

    id: str
    dataset_id: str
    status: AugmentationStatus
    config: AugmentationConfig
    created_at: datetime
    completed_at: Optional[datetime] = None
    samples_processed: int = 0
    total_samples: int = 0
    error_message: Optional[str] = None
