"""Historic run discovery service for finding and importing runs from disk."""

import os
import re
import glob
import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
import logging

from server.models.schemas import (
    HistoricRunDiscovery,
    RunResponse,
    RunStatus,
    ModelConfig,
    SystemSettings,
)

logger = logging.getLogger(__name__)


class HistoricRunDiscoveryService:
    """Service for discovering and importing historic runs from disk."""

    def __init__(self, storage_service):
        self.storage = storage_service
        self.settings_file = self.storage.data_dir / "system_settings.json"
        self.settings = self._load_settings()

    def _load_settings(self) -> SystemSettings:
        """Load system settings from disk."""
        if self.settings_file.exists():
            try:
                with open(self.settings_file, "r") as f:
                    data = json.load(f)
                    return SystemSettings(**data)
            except Exception as e:
                logger.error(f"Failed to load system settings: {e}")
        return SystemSettings()

    def save_settings(self):
        """Save system settings to disk."""
        try:
            with open(self.settings_file, "w") as f:
                json.dump(self.settings.dict(), f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to save system settings: {e}")

    def get_settings(self) -> SystemSettings:
        """Get current system settings."""
        return self.settings

    def update_settings(self, **kwargs) -> SystemSettings:
        """Update system settings."""
        for key, value in kwargs.items():
            if hasattr(self.settings, key):
                setattr(self.settings, key, value)
        self.save_settings()
        return self.settings

    def discover_historic_runs(
        self, auto_import: bool = False
    ) -> List[HistoricRunDiscovery]:
        """Scan disk for historic runs not in storage."""
        discovered = []

        # Get existing run IDs to avoid duplicates
        existing_runs = self.storage.list_runs()
        existing_run_ids = {run.id for run in existing_runs}

        # Scan work_folder for test mode runs
        work_folder = self.settings.work_folder
        if os.path.exists(work_folder):
            discovered.extend(self._scan_work_folder(work_folder, existing_run_ids))

        # Scan project_folder for normal mode runs
        project_folder = self.settings.project_folder
        if os.path.exists(project_folder):
            discovered.extend(
                self._scan_project_folder(project_folder, existing_run_ids)
            )

        # Update settings
        self.settings.last_discovery_scan = datetime.now()
        self.settings.discovered_runs_count = len(discovered)
        self.save_settings()

        # Auto-import if requested
        if auto_import:
            for discovery in discovered:
                self._import_historic_run(discovery)

        return discovered

    def _scan_work_folder(
        self, work_folder: str, existing_run_ids: set
    ) -> List[HistoricRunDiscovery]:
        """Scan work folder for test mode run folders."""
        discovered = []

        # Find all test mode folders
        test_mode_pattern = os.path.join(work_folder, "*_test_mode_")
        test_mode_folders = glob.glob(test_mode_pattern)

        for test_folder in test_mode_folders:
            if not os.path.isdir(test_folder):
                continue

            # Extract project name from folder name
            folder_name = os.path.basename(test_folder)
            project_match = re.match(r"(.+)_test_mode_", folder_name)
            if not project_match:
                continue
            project = project_match.group(1)

            # Find seismic folders inside
            seismic_pattern = os.path.join(test_folder, "seismic__*")
            seismic_folders = glob.glob(seismic_pattern)

            for seismic_folder in seismic_folders:
                if not os.path.isdir(seismic_folder):
                    continue

                # Parse folder name: seismic__{date_stamp}_{run_id}
                seismic_name = os.path.basename(seismic_folder)
                match = re.match(r"seismic__(\d{4}\.\d+)_(run_[\w\-]+)", seismic_name)

                if match:
                    date_stamp = match.group(1)
                    run_id = match.group(2)

                    # Skip if already in storage
                    if run_id in existing_run_ids:
                        continue

                    # Count volumes
                    npy_files = glob.glob(os.path.join(seismic_folder, "*.npy"))

                    discovered.append(
                        HistoricRunDiscovery(
                            run_id=run_id,
                            project=project,
                            date_stamp=date_stamp,
                            output_folder=seismic_folder,
                            discovered_at=datetime.now(),
                            is_test_mode=True,
                            volume_count=len(npy_files),
                        )
                    )

        return discovered

    def _scan_project_folder(
        self, project_folder: str, existing_run_ids: set
    ) -> List[HistoricRunDiscovery]:
        """Scan project folder for normal mode run folders."""
        discovered = []

        # Find all run folders
        run_pattern = os.path.join(project_folder, "*__*")
        run_folders = glob.glob(run_pattern)

        for run_folder in run_folders:
            if not os.path.isdir(run_folder):
                continue

            # Parse folder name: {project}__{date_stamp}_{run_id}
            folder_name = os.path.basename(run_folder)
            match = re.match(r"(.+)__(\d{4}\.\d+)_(run_[\w\-]+)", folder_name)

            if match:
                project = match.group(1)
                date_stamp = match.group(2)
                run_id = match.group(3)

                # Skip if already in storage
                if run_id in existing_run_ids:
                    continue

                # Count volumes
                npy_files = glob.glob(os.path.join(run_folder, "*.npy"))

                discovered.append(
                    HistoricRunDiscovery(
                        run_id=run_id,
                        project=project,
                        date_stamp=date_stamp,
                        output_folder=run_folder,
                        discovered_at=datetime.now(),
                        is_test_mode=False,
                        volume_count=len(npy_files),
                    )
                )

        return discovered

    def import_historic_run(self, run_id: str) -> Optional[RunResponse]:
        """Import a specific historic run into storage."""
        discovered = self.discover_historic_runs(auto_import=False)

        for discovery in discovered:
            if discovery.run_id == run_id:
                return self._import_historic_run(discovery)

        return None

    def _import_historic_run(self, discovery: HistoricRunDiscovery) -> RunResponse:
        """Import a discovered historic run into storage."""
        run = RunResponse(
            id=discovery.run_id,
            config_name=f"imported_{discovery.project}",
            status=RunStatus.COMPLETED,
            created_at=datetime.now(),
            started_at=datetime.now(),
            completed_at=datetime.now(),
            output_folder=discovery.output_folder,
            config=self._create_default_config(discovery.project),
            progress=100,
            current_step="completed",
            log_messages=[
                f"Imported from historic run folder",
                f"Discovered at: {discovery.discovered_at}",
                f"Test mode: {discovery.is_test_mode}",
            ],
        )

        # Save to storage
        self.storage.save_run(run)
        logger.info(f"Imported historic run: {discovery.run_id}")
        return run

    def _create_default_config(self, project: str) -> ModelConfig:
        """Create a default config for imported runs."""
        return ModelConfig(
            project=project,
            project_folder=f"/scratch/{project}",
            work_folder="/scratch",
        )

    def run_auto_discovery(self):
        """Run auto-discovery if enabled in settings."""
        if self.settings.auto_discover_historic_runs:
            logger.info("Running auto-discovery of historic runs...")
            discovered = self.discover_historic_runs(auto_import=True)
            logger.info(f"Auto-discovered and imported {len(discovered)} historic runs")
