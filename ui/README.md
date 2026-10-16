# SynToSeis Web UI

A modern web-based user interface for the SynToSeis synthetic seismic data generation tool.

## Overview

The SynToSeis Web UI provides a graphical interface for managing synthetic seismic data generation workflows. It includes:

- **Dashboard** - Overview of all runs and statistics
- **Runs Management** - Start, monitor, and manage model generation runs
- **Configuration Editor** - Visual editor for model parameters with descriptions
- **Rock Physics** - Configure rock property models
- **Wavelets** - Generate and visualize seismic wavelets

## Tech Stack

- **Backend**: FastAPI (Python)
- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Storage**: JSON files

## Quick Start

### Prerequisites

- Python 3.8+
- Node.js 18+

### Installation

1. **Install Python dependencies:**
```bash
pip install fastapi uvicorn pydantic python-multipart numpy scipy
```

2. **Install frontend dependencies:**
```bash
cd ui
npm install
```

### Running the Application

1. **Start the backend server:**
```bash
# From project root
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000
```

2. **Start the frontend development server:**
```bash
cd ui
npm run dev
```

3. **Open in browser:**
```
http://localhost:5173
```

## Features

### Dashboard (`/`)

The dashboard provides an overview of all model runs:

- **Statistics Cards**: Total runs, completed, running, failed counts
- **Recent Runs**: Quick view of the last 5 runs with status indicators
- **Quick Actions**: Button to create a new run

### Runs Management (`/runs`)

- **Create New Run**: Select from saved configurations or use defaults
- **View Runs**: List all runs with status (pending, running, completed, failed)
- **Run Details**: View detailed information about each run
- **Cancel/Delete**: Cancel running jobs or delete completed runs

### Run Detail Page (`/runs/:id`)

- **Progress Tracking**: Real-time progress bar with current step indicator
- **Console Output**: Live log messages from the Python process
- **Configuration Summary**: Key parameters used for the run
- **QC Images**: View generated quality control images
- **Auto-refresh**: Automatically updates every 3 seconds for running jobs

### Configuration Editor (`/configs`)

A comprehensive visual editor for model parameters:

**Parameter Sections:**
- Model Configuration - Basic model settings
- Layer Parameters - Geological layer settings
- Seismic Parameters - Signal generation & filtering
- Fault Configuration - Structural faulting
- Closure/Trap Settings - Hydrocarbon detection
- Geological Features - Salt, channels, fans
- Output & QC - Logging and output options

**Features:**
- **Tooltips**: Hover over any parameter to see description
- **Import/Export**: Load and save JSON configuration files
- **Validation**: Built-in defaults and helpful descriptions
- **Collapsible Sections**: Organized parameter groups

### Rock Physics (`/rockphysics`)

Configure rock property models with polynomial depth trends:

- **4 Rock Types**: Shale, Brine Sand, Oil Sand, Gas Sand
- **Properties**: Vp, Vs, Rho as functions of depth
- **Formula**: `value = a·z³ + b·z² + c·z + d`
- **Save/Load**: Store multiple rock physics configurations
- **Import/Export**: JSON file support

### Wavelets (`/wavelets`)

Generate and visualize seismic wavelets:

**Parameters:**
- Wavelet Type: Ricker (Mexican Hat), Ormsby, Klauder
- Frequency: Center frequency in Hz
- Sample Rate: 1, 2, 4, or 8 ms
- Convolutions: Number of self-convolutions
- Duration: Wavelet length in ms
- Polarity: Normal or Reverse

**Visualization:**
- Interactive canvas with proper axes
- Y-axis shows amplitude values
- Zero centerline
- Positive/negative areas filled
- Polarity toggle affects display

## API Endpoints

### Dashboard
- `GET /api/dashboard` - Get statistics

### Runs
- `GET /api/runs` - List all runs
- `POST /api/runs` - Create new run
- `GET /api/runs/{id}` - Get run details
- `DELETE /api/runs/{id}` - Delete run
- `POST /api/runs/{id}/cancel` - Cancel running job
- `GET /api/runs/{id}/qc` - Get QC images

### Configs
- `GET /api/configs` - List saved configs
- `POST /api/configs/{name}` - Save config
- `GET /api/configs/{name}` - Get config
- `DELETE /api/configs/{name}` - Delete config
- `GET /api/configs/default/model` - Get default config

### Rock Physics
- `GET /api/rockphysics/{name}` - Get rock physics config
- `POST /api/rockphysics/{name}` - Save rock physics config
- `DELETE /api/rockphysics/{name}` - Delete rock physics config

### Wavelets
- `POST /api/wavelets/generate` - Generate single wavelet
- `POST /api/wavelets/generate-batch` - Generate multiple wavelets

## Data Storage

Data is stored in JSON files:

- **Runs**: `server/data/runs/`
- **Configs**: `server/data/configs/`
- **Rock Physics**: `server/data/rockphysics/`

## Project Structure

```
SynToSeis/
├── server/                 # FastAPI backend
│   ├── api/
│   │   └── routes.py      # API endpoints
│   ├── models/
│   │   └── schemas.py     # Pydantic models
│   ├── services/
│   │   ├── storage.py     # JSON file storage
│   │   └── runner.py      # Model execution
│   ├── main.py            # FastAPI app
│   └── requirements.txt
├── ui/                     # React frontend
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── lib/           # API client & utilities
│   │   ├── App.tsx        # Main app
│   │   └── main.tsx       # Entry point
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
└── datagenerator/         # SynToSeis core
```

## Configuration Parameters

| Parameter | Description |
|-----------|-------------|
| `project` | Project name for rock physics selection |
| `project_folder` | Output directory |
| `work_folder` | Temporary working directory |
| `cube_shape` | [X, Y, Z] dimensions |
| `incident_angles` | Angle stack angles in degrees |
| `digi` | Vertical sampling rate (ms) |
| `include_salt` | Enable salt bodies |
| `basin_floor_fans` | Enable basin floor fans |
| `closure_types` | Types: simple, faulted, onlap |
| `min/max_number_faults` | Fault count range |
| `signal_to_noise_ratio_db` | Noise level |
| `bandwidth_low/high` | Frequency range (Hz) |

## Troubleshooting

### Frontend not connecting to API
- Ensure the backend is running on port 8000
- Check Vite proxy settings in `vite.config.ts`

### Wavelet generation errors
- Ensure numpy and scipy are installed
- Check Python path includes project root

### Port already in use
- Kill existing processes: `powershell -Command "Get-Process python | Stop-Process"`
- Use different port: `python -m uvicorn server.main:app --port 8001`

## License

See main SynToSeis project for license information.
