"""Storage service for managing runs and configs as JSON files."""

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional
import shutil

from server.models.schemas import RunResponse, RunStatus, ConfigSummary, ModelConfig

logger = logging.getLogger(__name__)


class StorageService:
    """Service for storing runs and configs as JSON files."""

    REQUIRED_CONFIG_FIELDS = {"name", "config"}
    REQUIRED_TIMESTAMP_FIELDS = {"created_at", "updated_at"}

    def __init__(self, data_dir: Optional[str] = None):
        """Initialize storage service.

        Args:
            data_dir: Directory to store JSON files. Defaults to project root data folder.
        """
        # Use absolute path based on this file's location
        if data_dir is None:
            base_dir = Path(__file__).parent.parent.parent
            data_dir = base_dir / "data"

        self.data_dir = Path(data_dir)
        self.runs_dir = self.data_dir / "runs"
        self.configs_dir = self.data_dir / "configs"
        self.quarantine_dir = self.configs_dir / "_quarantine"

        # Create directories if they don't exist
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.configs_dir.mkdir(parents=True, exist_ok=True)
        self.quarantine_dir.mkdir(parents=True, exist_ok=True)

    def _run_file_path(self, run_id: str) -> Path:
        """Get the file path for a run."""
        return self.runs_dir / f"{run_id}.json"

    def _config_file_path(self, config_name: str) -> Path:
        """Get the file path for a config."""
        safe_name = config_name.replace("/", "_").replace("\\", "_")
        return self.configs_dir / f"{safe_name}.json"

    def _quarantine_file(self, file_path: Path, reason: str = "malformed") -> None:
        """Move a corrupted file to quarantine directory."""
        try:
            quarantine_name = f"{file_path.stem}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{reason}.json"
            target = self.quarantine_dir / quarantine_name
            file_path.rename(target)
            logger.warning(f"Quarantined bad file: {file_path.name} -> {target.name}")
        except Exception as e:
            logger.error(f"Failed to quarantine file {file_path.name}: {e}")
            # Try to delete if rename fails
            try:
                file_path.unlink()
                logger.info(f"Deleted bad file: {file_path.name}")
            except Exception:
                pass

    def _validate_config_data(self, data: dict, filename: str) -> Optional[dict]:
        """Validate config has required fields. Returns None if invalid."""
        # Check for required top-level fields
        missing_fields = self.REQUIRED_CONFIG_FIELDS - set(data.keys())
        if missing_fields:
            logger.warning(
                f"Config {filename} missing required fields: {missing_fields}"
            )
            return None

        # Check for timestamps
        for ts_field in self.REQUIRED_TIMESTAMP_FIELDS:
            if ts_field not in data:
                # Try to use default timestamp
                data[ts_field] = datetime.now().isoformat()
            elif not isinstance(data[ts_field], (str, datetime)):
                logger.warning(f"Config {filename} has invalid {ts_field} type")
                data[ts_field] = datetime.now().isoformat()

        return data

    def _parse_timestamp(self, value: any) -> datetime:
        """Parse timestamp from string or datetime."""
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value)
            except ValueError:
                logger.warning(f"Invalid timestamp format: {value}, using now")
                return datetime.now()
        return datetime.now()

    # ============ RUN OPERATIONS ============

    def create_run(self, run: RunResponse) -> RunResponse:
        """Create a new run record."""
        run_file = self._run_file_path(run.id)
        with open(run_file, "w") as f:
            json.dump(run.model_dump(mode="json"), f, indent=2, default=str)
        return run

    def get_run(self, run_id: str) -> Optional[RunResponse]:
        """Get a run by ID."""
        run_file = self._run_file_path(run_id)
        if not run_file.exists():
            return None
        try:
            with open(run_file, "r") as f:
                data = json.load(f)
            return RunResponse(**data)
        except Exception as e:
            logger.error(f"Error loading run {run_id}: {e}")
            self._quarantine_file(run_file, "load_error")
            return None

    def update_run(self, run: RunResponse) -> RunResponse:
        """Update an existing run."""
        return self.create_run(run)

    def delete_run(self, run_id: str) -> bool:
        """Delete a run and its associated data."""
        run = self.get_run(run_id)
        if not run:
            return False

        run_file = self._run_file_path(run_id)
        if run_file.exists():
            run_file.unlink()

        if run.output_folder and os.path.exists(run.output_folder):
            shutil.rmtree(run.output_folder)

        return True

    def list_runs(self, status: Optional[RunStatus] = None) -> List[RunResponse]:
        """List all runs, optionally filtered by status."""
        runs = []
        for run_file in self.runs_dir.glob("*.json"):
            try:
                with open(run_file, "r") as f:
                    data = json.load(f)
                run = RunResponse(**data)
                if status is None or run.status == status:
                    runs.append(run)
            except Exception as e:
                logger.error(f"Error loading run {run_file.name}: {e}")
                self._quarantine_file(run_file, "parse_error")
                continue

        runs.sort(key=lambda r: r.created_at, reverse=True)
        return runs

    def get_dashboard_stats(self) -> dict:
        """Get dashboard statistics."""
        try:
            runs = self.list_runs()
        except Exception as e:
            logger.error(f"Error loading runs: {e}")
            runs = []

        # Get dataset statistics
        try:
            from server.services.dataset_service import dataset_service

            datasets = dataset_service.list_datasets()
            completed_datasets = [d for d in datasets if d.status.value == "completed"]
            total_train_samples = sum(d.sample_counts.train for d in completed_datasets)
            total_val_samples = sum(
                d.sample_counts.validation for d in completed_datasets
            )
        except Exception as e:
            logger.error(f"Error loading datasets: {e}")
            datasets = []
            completed_datasets = []
            total_train_samples = 0
            total_val_samples = 0

        return {
            "total_runs": len(runs),
            "completed_runs": len([r for r in runs if r.status == RunStatus.COMPLETED]),
            "failed_runs": len([r for r in runs if r.status == RunStatus.FAILED]),
            "running_runs": len([r for r in runs if r.status == RunStatus.RUNNING]),
            "pending_runs": len([r for r in runs if r.status == RunStatus.PENDING]),
            # Dataset metrics
            "total_datasets": len(datasets),
            "completed_datasets": len(completed_datasets),
            "total_train_samples": total_train_samples,
            "total_val_samples": total_val_samples,
        }

    # ============ CONFIG OPERATIONS ============

    def save_config(self, name: str, config: ModelConfig) -> ConfigSummary:
        """Save a configuration with atomic write."""
        config_file = self._config_file_path(name)
        now = datetime.now().isoformat()

        # Check existing config
        existing = self.get_config(name)
        created_at = existing.created_at.isoformat() if existing else now

        config_data = {
            "name": name,
            "config": config.model_dump(),
            "created_at": created_at,
            "updated_at": now,
        }

        # Atomic write: temp file then rename
        temp_file = config_file.with_suffix(".tmp")
        try:
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=2)
                f.flush()
                os.fsync(f.fileno())
            temp_file.replace(config_file)
            logger.info(f"Saved config: {name}")
        except Exception as e:
            if temp_file.exists():
                try:
                    temp_file.unlink()
                except Exception:
                    pass
            logger.error(f"Failed to save config {name}: {e}")
            raise

        return ConfigSummary(
            name=name,
            created_at=self._parse_timestamp(created_at),
            updated_at=self._parse_timestamp(now),
        )

    def get_config(self, name: str) -> Optional[ConfigSummary]:
        """Get a config summary by name."""
        config_file = self._config_file_path(name)
        if not config_file.exists():
            return None

        try:
            with open(config_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            data = self._validate_config_data(data, config_file.name)
            if data is None:
                self._quarantine_file(config_file, "invalid_structure")
                return None

            return ConfigSummary(
                name=data["name"],
                created_at=self._parse_timestamp(data["created_at"]),
                updated_at=self._parse_timestamp(data["updated_at"]),
            )
        except json.JSONDecodeError as e:
            logger.error(f"Malformed JSON in {config_file.name}: {e}")
            self._quarantine_file(config_file, "json_error")
            return None
        except Exception as e:
            logger.error(f"Error loading config {name}: {e}")
            return None

    def get_config_full(self, name: str) -> Optional[ModelConfig]:
        """Get full config with all parameters."""
        config_file = self._config_file_path(name)
        if not config_file.exists():
            return None

        try:
            with open(config_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            if "config" not in data:
                logger.warning(f"Config {name} missing 'config' field")
                return None

            return ModelConfig(**data["config"])
        except json.JSONDecodeError as e:
            logger.error(f"Malformed JSON in {config_file.name}: {e}")
            self._quarantine_file(config_file, "json_error")
            return None
        except Exception as e:
            logger.error(f"Error loading config {name}: {e}")
            return None

    def delete_config(self, name: str) -> bool:
        """Delete a config."""
        config_file = self._config_file_path(name)
        if config_file.exists():
            config_file.unlink()
            logger.info(f"Deleted config: {name}")
            return True
        return False

    def list_configs(self) -> List[ConfigSummary]:
        """List all valid config files, skipping malformed ones."""
        configs = []

        for config_file in self.configs_dir.glob("*.json"):
            try:
                with open(config_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                # Validate structure
                data = self._validate_config_data(data, config_file.name)
                if data is None:
                    self._quarantine_file(config_file, "invalid_structure")
                    continue

                configs.append(
                    ConfigSummary(
                        name=data["name"],
                        created_at=self._parse_timestamp(data["created_at"]),
                        updated_at=self._parse_timestamp(data["updated_at"]),
                    )
                )

            except json.JSONDecodeError as e:
                logger.error(f"Skipping malformed JSON {config_file.name}: {e}")
                self._quarantine_file(config_file, "json_error")
                continue
            except Exception as e:
                logger.exception(f"Unexpected error loading {config_file.name}: {e}")
                self._quarantine_file(config_file, "unknown_error")
                continue

        configs.sort(key=lambda c: c.updated_at, reverse=True)
        return configs


# Singleton instance
_storage_service: Optional[StorageService] = None


def get_storage_service(data_dir: Optional[str] = None) -> StorageService:
    """Get or create the storage service singleton."""
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService(data_dir)
    return _storage_service
