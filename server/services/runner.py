"""Service for running synthoseis models."""

import os
import subprocess
import uuid
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, List
import threading
import glob
import sys

# Add datagenerator to path for importing path utilities
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from datagenerator.paths import get_output_folder_path

from server.models.schemas import RunResponse, RunStatus, ModelConfig, QCImage


class RunnerService:
    """Service for running synthoseis models as subprocesses."""

    def __init__(self, storage_service):
        """Initialize runner service."""
        self.storage = storage_service
        self.main_script = Path(__file__).parent.parent.parent / "main.py"
        self.processes = {}

        # Find the correct Python interpreter (use venv if available)
        base_dir = Path(__file__).parent.parent.parent
        venv_python = base_dir / ".venv" / "Scripts" / "python.exe"
        if venv_python.exists():
            self.python_exe = str(venv_python)
        else:
            self.python_exe = "python"

    def _generate_run_id(self) -> str:
        """Generate a unique run ID."""
        return f"run_{uuid.uuid4().hex[:8]}"

    def start_run(
        self,
        config: ModelConfig,
        config_name: str,
        num_runs: int = 1,
        run_id: Optional[str] = None,
        test_mode: Optional[int] = None,
    ) -> RunResponse:
        """Start a new synthoseis model run."""
        run_id = run_id or self._generate_run_id()
        now = datetime.now()

        run = RunResponse(
            id=run_id,
            config_name=config_name,
            status=RunStatus.PENDING,
            created_at=now,
            config=config,
            log_messages=[
                f"Run {run_id} created. Waiting to start..."
                + (f" (Test Mode: {test_mode})" if test_mode else "")
            ],
            progress=0,
            current_step="initialized",
        )

        self.storage.create_run(run)

        thread = threading.Thread(
            target=self._run_model, args=(run.id, config, num_runs, run_id, test_mode)
        )
        thread.daemon = True
        thread.start()

        return run

    def _update_progress(self, run_id: str, progress: int, step: str, log: str = None):
        """Update run progress and log."""
        run = self.storage.get_run(run_id)
        if run:
            run.progress = progress
            run.current_step = step
            if log:
                run.log_messages.append(log)
                # Keep only last 100 messages
                run.log_messages = run.log_messages[-100:]
            self.storage.update_run(run)

    def _run_model(
        self,
        run_id: str,
        config: ModelConfig,
        num_runs: int,
        run_id_prefix: str,
        test_mode: Optional[int] = None,
    ):
        """Run the synthoseis model in a background thread."""
        run = self.storage.get_run(run_id)
        if not run:
            return

        test_mode_msg = f" (TEST MODE: {test_mode})" if test_mode else ""
        self._update_progress(
            run_id, 5, "starting", f"Starting synthoseis model...{test_mode_msg}"
        )

        run.status = RunStatus.RUNNING
        run.started_at = datetime.now()
        run.log_messages.append("Model initialization started")
        self.storage.update_run(run)

        try:
            import tempfile
            import json

            self._update_progress(run_id, 10, "config", "Writing configuration file...")

            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", delete=False
            ) as f:
                # Extract just the config dict (SynToSeis expects flat structure, not wrapped)
                config_dict = config.model_dump()
                json.dump(config_dict, f)
                config_file = f.name

            output_folder = get_output_folder_path(
                project=config.project,
                project_folder=config.project_folder,
                work_folder=config.work_folder,
                run_id=run_id_prefix,
                test_mode=test_mode,
            )

            # Extract date_stamp from the generated output_folder path
            # Format: .../seismic__{date_stamp}_{run_id} or .../seismic__{date_stamp}
            folder_name = os.path.basename(output_folder)
            if folder_name.startswith("seismic__"):
                date_stamp = folder_name.replace("seismic__", "").replace(
                    f"_{run_id_prefix}", ""
                )
            else:
                date_stamp = datetime.now().strftime("%Y.%j%H%M%S")

            # Create output directories if they don't exist
            try:
                os.makedirs(output_folder, exist_ok=True)
                self._update_progress(
                    run_id, 12, "config", f"Created output folder: {output_folder}"
                )
            except Exception as e:
                self._update_progress(
                    run_id, 12, "config", f"Warning: Could not create folder: {e}"
                )

            self._update_progress(
                run_id, 15, "horizons", "Building unfaulted depth maps..."
            )

            cmd = [
                self.python_exe,
                str(self.main_script),
                "--config_file",
                config_file,
                "--num_runs",
                str(num_runs),
                "--run_id",
                run_id_prefix,
                "--date_stamp",
                date_stamp,
            ]

            if test_mode:
                cmd.extend(["--test_mode", str(test_mode)])

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=str(self.main_script.parent),
                bufsize=1,
                universal_newlines=True,
            )

            self.processes[run_id] = process

            # Read output line by line
            output_lines = []
            for line in process.stdout:
                line = line.strip()
                output_lines.append(line)
                if line:
                    # Check for key phrases in output
                    if "horizon" in line.lower():
                        self._update_progress(run_id, 35, "horizons", line[:200])
                    elif "facies" in line.lower():
                        self._update_progress(run_id, 45, "facies", line[:200])
                    elif "fault" in line.lower():
                        self._update_progress(run_id, 55, "faults", line[:200])
                    elif "closure" in line.lower():
                        self._update_progress(run_id, 65, "closures", line[:200])
                    elif "elastic" in line.lower() or "seismic" in line.lower():
                        self._update_progress(run_id, 75, "seismic", line[:200])
                    elif "elapsed" in line.lower():
                        self._update_progress(run_id, 95, "output", line[:200])
                    elif (
                        "error" in line.lower()
                        or "exception" in line.lower()
                        or "traceback" in line.lower()
                    ):
                        self._update_progress(
                            run_id,
                            run.progress,
                            run.current_step or "error",
                            line[:200],
                        )

            stdout = "\n".join(output_lines)
            stderr = ""

            run = self.storage.get_run(run_id)

            # Check for successful completion: explicit exit code 0 OR success message in output
            success = (process.returncode == 0) or (
                process.returncode is None and "Main completed successfully" in stdout
            )

            if success:
                run.status = RunStatus.COMPLETED
                run.output_folder = output_folder
                run.progress = 100
                run.current_step = "completed"
                run.log_messages.append("Model completed successfully!")

                if stdout:
                    run.log_messages.append(f"Output: {stdout[-1000:]}")
            else:
                run.status = RunStatus.FAILED
                # Show full stdout on failure (it contains the error)
                error_msg = stdout[-2000:] if stdout else "Unknown error (no output)"
                run.error_message = error_msg
                run.log_messages.append(
                    f"ERROR: Process failed with return code {process.returncode}"
                )
                run.log_messages.append(f"Output:\n{stdout[-2000:]}")

            run.completed_at = datetime.now()
            self.storage.update_run(run)

        except Exception as e:
            run = self.storage.get_run(run_id)
            if run:
                run.status = RunStatus.FAILED
                run.error_message = f"{type(e).__name__}: {str(e)}"
                run.log_messages.append(f"EXCEPTION: {type(e).__name__}: {str(e)}")
                run.completed_at = datetime.now()
                self.storage.update_run(run)

        finally:
            if "config_file" in locals() and os.path.exists(config_file):
                try:
                    os.unlink(config_file)
                except:
                    pass

            if run_id in self.processes:
                del self.processes[run_id]

    def cancel_run(self, run_id: str) -> bool:
        """Cancel a running process."""
        if run_id in self.processes:
            process = self.processes[run_id]
            process.terminate()

            run = self.storage.get_run(run_id)
            run.status = RunStatus.CANCELLED
            run.completed_at = datetime.now()
            run.log_messages.append("Run cancelled by user")
            self.storage.update_run(run)

            del self.processes[run_id]
            return True
        return False

    def _get_qc_image_info(self, filename: str) -> tuple[str, str]:
        """Generate title and description from QC image filename.

        Returns:
            tuple: (title, description)
        """
        # Remove extension and date stamp for cleaner name
        name = os.path.splitext(filename)[0]

        # Dictionary mapping filename patterns to titles/descriptions
        qc_patterns = {
            "closure_segments": (
                "Closure Segments",
                "Hydrocarbon closure segments identified in the model",
            ),
            "strat_closure": (
                "Stratigraphic Closures",
                "Stratigraphic/onlap closure locations",
            ),
            "fault_segments": ("Fault Segments", "Fault plane locations and segments"),
            "fault_throw": ("Fault Throw", "Fault displacement/throw visualization"),
            "fault_intersections": (
                "Fault Intersections",
                "Where faults intersect each other",
            ),
            "facies": ("Facies Distribution", "Sand and shale layer distribution"),
            "lithology": ("Lithology", "Rock type distribution (sand/shale)"),
            "seismic": ("Seismic Volume", "Generated seismic data"),
            "rfc": ("Reflection Coefficients", "Reflection coefficient volumes"),
            "depth_maps": ("Depth Maps", "Horizon depth structure maps"),
            "geologic_age": ("Geologic Age", "Age model of geological layers"),
            "salt": ("Salt Body", "Salt body geometry and location"),
            "net_to_gross": ("Net to Gross", "Ratio of reservoir-quality rock"),
            "porosity": ("Porosity", "Porosity distribution in the model"),
            " impedance": ("Impedance", "Acoustic impedance volumes"),
            "vp": ("P-Wave Velocity", "Compressional wave velocity"),
            "vs": ("S-Wave Velocity", "Shear wave velocity"),
            "rho": ("Density", "Bulk density distribution"),
        }

        # Find matching pattern
        name_lower = name.lower()
        for pattern, (title, desc) in qc_patterns.items():
            if pattern in name_lower:
                return title, desc

        # Default: clean up the filename
        # Replace underscores and dashes with spaces
        clean_name = name.replace("_", " ").replace("-", " ").replace("__", " ")
        # Remove qcplot prefix if present
        clean_name = clean_name.replace("qcplot", "").strip()
        # Title case
        title = clean_name.title()
        return title, f"QC visualization: {title}"

    def get_qc_images(self, run_id: str) -> List[QCImage]:
        """Get QC images for a completed run."""
        run = self.storage.get_run(run_id)
        if not run or not run.output_folder:
            return []

        images = []

        # With unified paths, we only need to search the actual output folder
        output_folder = run.output_folder

        # Search only for PNG files
        if os.path.exists(output_folder):
            for png_file in glob.glob(os.path.join(output_folder, "*.png")):
                if os.path.isfile(png_file) and os.path.getsize(png_file) > 0:
                    filename = os.path.basename(png_file)
                    rel_path = os.path.relpath(png_file, output_folder)
                    title, description = self._get_qc_image_info(filename)

                    images.append(
                        QCImage(
                            name=filename,
                            title=title,
                            description=description,
                            path=png_file,
                            url=f"/api/runs/{run_id}/qc/{rel_path}",
                            thumbnail_url=f"/api/runs/{run_id}/qc/{rel_path}",
                        )
                    )

        return images


_runner_service: Optional[RunnerService] = None


def get_runner_service(storage_service=None) -> RunnerService:
    """Get or create the runner service singleton."""
    global _runner_service
    if _runner_service is None:
        _runner_service = RunnerService(storage_service)
    return _runner_service
