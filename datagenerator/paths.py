"""
SynToSeis path utilities.

Single source of truth for output folder generation.
"""

import os
from datetime import datetime


def get_output_folder_path(
    project: str,
    project_folder: str,
    work_folder: str,
    run_id: str = None,
    test_mode: int = None,
    date_stamp: str = None,
) -> str:
    """
    Generate the output folder path for a SynToSeis run.

    This is the single source of truth for folder naming to ensure
    consistency between the runner and main.py.

    Parameters
    ----------
    project : str
        Project name from config
    project_folder : str
        Project folder path from config
    work_folder : str
        Work folder path from config
    run_id : str, optional
        Run identifier
    test_mode : int, optional
        Test mode size (if set, uses test_mode naming)
    date_stamp : str, optional
        Date stamp string. If not provided, generates current timestamp.

    Returns
    -------
    str
        Absolute path to the output folder
    """
    if date_stamp is None:
        date_stamp = datetime.now().strftime("%Y.%j%H%M%S")

    # Get project name from project_folder if available, otherwise use project
    project_name = os.path.basename(os.path.normpath(project_folder)) or project

    if test_mode:
        # Test mode: work_folder/{project}_test_mode_/seismic__{date_stamp}_{runid}
        test_folder_name = f"{project_name}_test_mode_"
        base_folder = os.path.join(work_folder, test_folder_name)

        if run_id:
            output_folder = os.path.join(base_folder, f"seismic__{date_stamp}_{run_id}")
        else:
            output_folder = os.path.join(base_folder, f"seismic__{date_stamp}")
    else:
        # Normal mode: project_folder/{project}__{date_stamp}_{runid}
        if run_id:
            folder_name = f"{project_name}__{date_stamp}_{run_id}"
        else:
            folder_name = f"{project_name}__{date_stamp}"

        output_folder = os.path.join(project_folder, folder_name)

    return os.path.abspath(output_folder)


def get_temp_folder_path(
    work_folder: str,
    run_id: str = None,
    date_stamp: str = None,
) -> str:
    """
    Generate the temp folder path for a SynToSeis run.

    Parameters
    ----------
    work_folder : str
        Work folder path from config
    run_id : str, optional
        Run identifier
    date_stamp : str, optional
        Date stamp string. If not provided, generates current timestamp.

    Returns
    -------
    str
        Absolute path to the temp folder
    """
    if date_stamp is None:
        date_stamp = datetime.now().strftime("%Y.%j%H%M%S")

    if run_id:
        temp_folder = os.path.join(work_folder, f"temp_folder__{date_stamp}_{run_id}")
    else:
        temp_folder = os.path.join(work_folder, f"temp_folder__{date_stamp}")

    return os.path.abspath(temp_folder)
