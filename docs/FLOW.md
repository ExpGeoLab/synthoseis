# SynToSeis Data Generation Flow

## Overview

SynToSeis generates synthetic 3D seismic data for training deep learning networks. The pipeline creates realistic seismic volumes with geological features including horizons, faults, closures (hydrocarbon traps), salt bodies, and basin floor fans.

## Entry Points

### Command Line
```bash
python main.py --config config/example.json --test_mode 100 --run_id my_run
```

### Python API
```python
import main as mn

# Basic usage
mn.build_model(user_json="config/example.json", run_id=1, test_mode=50)

# With rock property factors
factor_dict = {
    "layershiftsamples": 75,
    "RPshiftsamples": 11,
    "shalerho_factor": 1.0,
    "sandvp_factor": 1.0,
}
mn.build_model(user_json="config.json", run_id=1, rpm_factors=factor_dict)
```

---

## How main.py is Called

There are **3 ways** to invoke main.py:

### 1. Direct Command Line
```bash
python main.py --config config/example.json --test_mode 50 --run_id my_run --num_runs 1
```

**Arguments:**
| Argument | Short | Description | Default |
|----------|-------|-------------|---------|
| `--config_file` | `-c` | Path to config JSON file | Required |
| `--test_mode` | `-t` | Run with reduced volume size (NxN) | None (full size) |
| `--run_id` | `-r` | Unique run identifier | Auto-generated |
| `--num_runs` | `-n` | Number of models to generate | 1 |

### 2. Shell Script
```bash
bash scripts/start_geocrawlSynthetics.sh \
  --config config/example.json \
  --num_run 5 \
  --run_id my_run \
  --test_mode 50
```

The shell script activates the `synthoseis` conda environment before running.

### 3. Server API (FastAPI)
The `server/services/runner.py` module runs main.py as a subprocess:

```python
# In server/services/runner.py
cmd = [
    self.python_exe,
    str(self.main_script),
    "--config_file", config_file,
    "--num_runs", str(num_runs),
    "--run_id", run_id_prefix,
]
if test_mode:
    cmd.extend(["--test_mode", str(test_mode)])

process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, ...)
```

The runner captures stdout/stderr in real-time and determines success/failure based on the process exit code.

**Important:** main.py must exit with `sys.exit(0)` on success. Without an explicit exit code, some subprocess runners may report "Process failed with return code None".

---

## Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SYNTHOSEIS PIPELINE                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐
│ Parameters  │  1. Load config JSON
│   Setup     │  2. Create directories  
│  (step 1)   │  3. Setup HDF5 file
└──────┬──────┘     4. Apply test_mode scaling
       │
       ▼
┌─────────────┐
│   Build     │  Horizons.build_unfaulted_depth_maps()
│   Unfaulted │  - Create base horizon with initial_layer_stdev
│   Depth     │  - Loop layers until seabed_min_depth
│   Maps      │  - Generate onlaps (if enabled)
│  (step 2)   │  - Generate basin floor fans (if enabled)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Create    │  Horizons.create_facies_array()
│   Facies    │  - Markov chain: sand (1) / shale (0)
│   Array     │  - Based on sand_layer_pct
│  (step 3)   │  - Apply onlap modifications
       │       │  - Apply fan modifications
       ▼       │
┌─────────────┐
│  Unfaulted  │  Geomodel.build_unfaulted_geomodels()
│  Geomodels  │  - Lithology volume
│  (step 4)   │  - Net-to-gross volume
       │       │  - Depth volume
       ▼       │
┌─────────────┐
│   Apply     │  Faults.apply_faulting_to_geomodels_and_depth_maps()
│   Faulting  │  Faults.build_faulted_property_geomodels()
│  (step 5)   │  - Select fault style: random, self_branching,
       │       │    stair_case, relay_ramp, horst_graben
       │       │  - Generate N faults (min to max)
       ▼       │
┌─────────────┐
│   Create    │  Closures.create_closures()
│  Closures   │  - Loop through horizons
│  (step 6)   │  - Flood-fill algorithm for closure detection
       │       │  - Classify: simple, faulted, onlap
       │       │  - Filter by min_closure_voxels
       ▼       │
┌─────────────┐
│   Generate  │  SeismicVolume.build_elastic_properties()
│   Seismic   │  - Calculate Vp, Vs, Rho
│   Data      │  SeismicVolume.build_seismic_volumes()
│  (step 7)   │  - Zoeppritz reflection coefficients
       │       │  - Add noise (signal_to_noise_ratio_db)
       │       │  - Butterworth bandpass filter
       │       │  - Augmentation (if enabled)
       ▼       │
┌─────────────┐
│  Output &   │  - Write seismic cubes (.npy)
│  Cleanup    │  - Write log files
│  (step 8)   │  - Write SQLite database
              │  - Cleanup temp folder
              └─────────────────────────────────────────────────────────────┘
```

---

## Step Details

### Step 1: Parameters Setup (`Parameters.py`)

```python
from datagenerator.Parameters import Parameters

p = Parameters(user_config="config/example.json", runid="run_001", test_mode=50)
p.setup_model(rpm_factors=factor_dict)
p.hdf_setup("model_data.hdf")
```

**Key operations:**
- Load and validate config JSON
- Create output directories
- Initialize HDF5 file with PyTables
- Set random seeds
- Apply test_mode scaling (reduces X/Y dimensions)

---

### Step 2: Build Unfaulted Depth Maps (`Horizons.py`)

```python
from datagenerator.Horizons import build_unfaulted_depth_maps

depth_maps, onlap_list, fan_list, fan_thicknesses = build_unfaulted_depth_maps(p)
```

**Process:**
1. Create base horizon with initial layer stdev
2. Iteratively add layers until `seabed_min_depth` reached
3. Generate onlap surfaces (if `closure_types` includes "onlap")
4. Generate basin floor fans (if `basin_floor_fans: true`)

**Config params used:**
- `initial_layer_stdev`: Base horizon depth variation
- `thickness_min/max`: Layer thickness range
- `seabed_min_depth`: Minimum depth for top layer
- `dip_factor_max`: Layer dip scaling

---

### Step 3: Create Facies Array (`Horizons.py`)

```python
from datagenerator.Horizons import create_facies_array

facies = create_facies_array(p, depth_maps, onlap_list, fan_list)
```

**Process:**
1. Use Markov chain to assign facies based on `sand_layer_pct`
2. Apply onlap modifications (layers below onlaps → shale)
3. Apply fan modifications (fan layers → sand)

**Config params used:**
- `sand_layer_thickness`: Average stacked sand thickness
- `sand_layer_fraction`: min/max sand percentage (5-25% default)

**Facies codes:**
- `-1`: Water layer
- `0`: Shale
- `1`: Sand

---

### Step 4: Build Unfaulted Geomodels (`Geomodels.py`)

```python
from datagenerator.Geomodels import Geomodel

geo_models = Geomodel(p, depth_maps, onlap_list, facies)
geo_models.build_unfaulted_geomodels()
```

**Outputs:**
- Lithology volume (shale/salt/sand)
- Net-to-gross volume
- Depth volume

---

### Step 5: Apply Faulting (`Faults.py`)

```python
from datagenerator.Faults import Faults

f = Faults(p, depth_maps, onlap_list, geo_models, fan_list, fan_thicknesses)
f.apply_faulting_to_geomodels_and_depth_maps()
f.build_faulted_property_geomodels(facies)
```

**Fault styles:**
| Style | Description |
|-------|-------------|
| `random` | Completely random fault planes |
| `self_branching` | Faults that branch into multiple planes |
| `stair_case` | Series of sub-parallel faults |
| `horst_graben` | Alternating elevated and depressed blocks |
| `relay_ramp` | Transfer zone between faults |

**Config params used:**
- `min_number_faults` / `max_number_faults`
- `dip_factor_max`
- `infill_factor`

---

### Step 6: Create Closures (`Closures.py`)

```python
from datagenerator.Closures import Closures

closures = Closures(p, f, facies, onlap_list)
closures.create_closures()
closures.write_closure_volumes_to_disk()
```

**Process:**
1. Loop through each horizon
2. Apply flood-fill algorithm to find closed structures
3. Classify closure type:
   - **simple**: 4-way closure
   - **faulted**: 3-way closure against fault
   - **onlap**: Stratigraphic closure
4. Filter by minimum voxel thresholds
5. Randomly fill with fluids (oil, gas, brine)

**Config params used:**
- `closure_types`: ["simple", "faulted", "onlap"]
- `min_closure_voxels_simple`
- `min_closure_voxels_faulted`
- `min_closure_voxels_onlap`
- `max_column_height`

---

### Step 7: Generate Seismic Data (`Seismic.py`)

```python
from datagenerator.Seismic import SeismicVolume

seismic = SeismicVolume(p, f, closures)
seismic.build_elastic_properties("inv_vel")
seismic.build_seismic_volumes()
```

**Process:**

1. **Elastic Properties** (`build_elastic_properties`):
   - Calculate Vp (P-wave velocity)
   - Calculate Vs (S-wave velocity)
   - Calculate Rho (density)
   - Apply rock physics models (shale, brine sand, oil sand, gas sand)

2. **Seismic Volumes** (`build_seismic_volumes`):
   - Apply Zoeppritz equations for reflection coefficients
   - Generate angle stacks (near, mid, far)
   - Add random noise based on `signal_to_noise_ratio_db`
   - Apply Butterworth bandpass filter
   - Apply augmentation (lateral smoothing, trace integration, etc.)

**Config params used:**
- `incident_angles`: [7, 15, 24] degrees
- `bandwidth_low` / `bandwidth_high`: [3, 6] / [20, 35] Hz
- `bandwidth_ord`: Filter order
- `signal_to_noise_ratio_db`: [7.5, 12.5, 17.5] dB

---

### Step 8: Output & Cleanup

**Generated files:**
```
project_folder/
├── seismic__timestamp/
│   ├── seismicCubes_RFC_fullstack_timestamp.npy    # Full stack seismic
│   ├── seismicCubes_RFC_near_timestamp.npy         # Near angle stack
│   ├── seismicCubes_RFC_mid_timestamp.npy          # Mid angle stack
│   ├── seismicCubes_RFC_far_timestamp.npy          # Far angle stack
│   ├── lithology_timestamp.npy                     # Lithology volume
│   ├── net_to_gross_timestamp.npy                 # Net-to-gross volume
│   ├── faulted_age_volume_timestamp.npy            # Faulted age model
│   ├── closures_timestamp.npy                      # Closure segments
│   ├── model_parameters_timestamp.txt             # Parameter log
│   └── qcplot_*.png                                # QC plots
```

---

## Configuration Parameters

### Model Configuration
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project` | string | - | Project name for rock physics selection |
| `project_folder` | string | - | Output directory |
| `work_folder` | string | - | Temporary working directory |
| `cube_shape` | array | [300,300,1250] | [X, Y, Z] dimensions |

### Layer Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `thickness_min` | int | 2 | Minimum layer thickness (samples) |
| `thickness_max` | int | 12 | Maximum layer thickness (samples) |
| `seabed_min_depth` | array | [20,50] | Min depth range (metres) |
| `initial_layer_stdev` | array | [7.0,25.0] | Base horizon stdev range |
| `sand_layer_thickness` | int | 2 | Average stacked sand thickness |
| `sand_layer_fraction` | object | {min:0.05,max:0.25} | Sand percentage range |

### Fault Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `min_number_faults` | int | 1 | Minimum fault count |
| `max_number_faults` | int | 6 | Maximum fault count |
| `dip_factor_max` | int | 2 | Dip scaling factor |

### Closure Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `closure_types` | array | all | Types: simple, faulted, onlap |
| `min_closure_voxels_simple` | int | 500 | Min voxels for simple |
| `min_closure_voxels_faulted` | int | 2500 | Min voxels for faulted |
| `min_closure_voxels_onlap` | int | 500 | Min voxels for onlap |
| `max_column_height` | array | [150,150] | Max column height (metres) |

### Seismic Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `incident_angles` | array | [7,15,24] | Angle stack angles (degrees) |
| `digi` | int | 4 | Vertical sampling rate (ms) |
| `bandwidth_low` | array | [3.0,6.0] | Low-cut frequency range (Hz) |
| `bandwidth_high` | array | [20.0,35.0] | High-cut frequency range (Hz) |
| `bandwidth_ord` | int | 4 | Butterworth filter order |
| `signal_to_noise_ratio_db` | array | [7.5,12.5,17.5] | SNR range (dB) |

### Feature Flags
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `include_salt` | bool | true | Enable salt bodies |
| `basin_floor_fans` | bool | false | Enable fan features |
| `include_channels` | bool | false | Insert meandering fluvial channel belts (sand bodies, meanderpy) |
| `variable_shale_ng` | bool | false | Enable lateral NG variation |
| `partial_voxels` | bool | true | Enable partial voxel blending |

### Output Options
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `write_to_hdf` | bool | false | Write HDF5 output |
| `model_qc_volumes` | bool | true | Save QC volumes |
| `extra_qc_plots` | bool | true | Additional QC plots |
| `multiprocess_bp` | bool | true | Parallel bandpass filtering |

---

## Test Mode

Use `--test_mode N` (or `test_mode=N` in Python) to run with reduced volume size.

```bash
python main.py --config config/example.json --test_mode 100
```

**Behavior:**
- Reduces X/Y dimensions to N×N (default 50×50)
- Reduces Z dimension proportionally
- Output folder gets `_test_mode_` suffix

**Recommendations:**
- Minimum value: `>= 50` (allows space for faults/features)
- Small values may cause failures:
  - Insufficient space for fault placement
  - No sand layers generated (causes crash)
  - Salt body generation failures

**Example:**
```python
# Full model: 300x300x1250
# Test mode 100: 100x100x1250 (reduced)
mn.build_model("config.json", run_id=1, test_mode=100)
```

---

## Known Issues

### 1. Empty Sand Layers Crash
**Symptom:** `ValueError: zero-size array to reduction operation minimum`

**Cause:** Random facies generation produces zero sand layers in small test mode.

**Location:** `Closures.py` lines 744-755

**Fix:** Wrap logfile writes with empty array check:
```python
if len(avg_sand_thickness) > 0:
    self.cfg.write_to_logfile(...)
else:
    self.cfg.write_to_logfile(val=0)  # or np.nan
```

### 2. Salt Bodies in Test Mode
**Symptom:** Salt generation may fail in small test mode volumes.

**Priority:** Low

### 3. Windows Path Handling
**Symptom:** `FileNotFoundError` with mixed `/` and `\` paths

**Cause:** Cross-platform path handling issues in temp folder operations.

---

## Module Structure

```
datagenerator/
├── __init__.py
├── Parameters.py      # Configuration and HDF5 management
├── Horizons.py        # Depth maps and facies generation
├── Geomodels.py       # Lithology, N/G, depth volumes
├── Faults.py          # Fault generation and application
├── Closures.py        # Closure detection and classification
├── Seismic.py         # Elastic properties and seismic volumes
├── Salt.py            # Salt body generation
├── wavelets.py        # Ricker, Ormsby, Klauder wavelets
├── Augmentation.py    # Seismic augmentation
├── util.py            # Utilities and plotting
├── fluvsim.py         # Fluvial channel simulation
├── meanderpy.py       # Meandering channel simulation
└── histogram_equalizer.py

datagenerator_backup/  # Backup of original files (unchanged)
```

---

## Rock Physics Models

Rock property models define depth trends for:
- **Shale**: Vp, Vs, Rho as functions of depth
- **Brine Sand**: Sand with brine fill
- **Oil Sand**: Sand with oil fill  
- **Gas Sand**: Sand with gas fill

See `rockphysics/rpm_example.py` for template.
