"""Entry point for building a syntehtic model."""

import argparse
import datetime
import sys
import os
import shutil
import numpy as np
import matplotlib.pyplot as plt

import sys
import os

sys.path.append("../")
sys.path.append("../../")
sys.path.append("./datagenerator/")


from datagenerator.Closures import Closures
from datagenerator.Faults import Faults
from datagenerator.Geomodels import Geomodel
from datagenerator.Horizons import build_unfaulted_depth_maps, create_facies_array
from datagenerator.Parameters import Parameters
from datagenerator.Seismic import SeismicVolume
from datagenerator.util import plot_3D_closure_plot


def build_model(
    user_json: str,
    run_id,
    test_mode: int = None,
    rpm_factors=None,
    date_stamp: str = None,
):
    """Build model from config file."""
    # Set up model parameters with date_stamp if provided
    p = Parameters(user_json, runid=run_id, test_mode=test_mode, date_stamp=date_stamp)
    p.setup_model(rpm_factors=rpm_factors)

    p.hdf_setup(os.path.join(p.temp_folder, "model_data.hdf"))
    # Build un-faulted depth maps and facies array
    depth_maps, onlap_list, fan_list, fan_thicknesses = build_unfaulted_depth_maps(p)
    print(
        f"DEBUG main.py: depth_maps.shape = {depth_maps.shape}, id = {id(depth_maps)}"
    )
    facies = create_facies_array(p, depth_maps, onlap_list, fan_list)

    # Build un-faulted geological models
    geo_models = Geomodel(p, depth_maps, onlap_list, facies)
    geo_models.build_unfaulted_geomodels()

    # Build Faults
    f = Faults(p, depth_maps, onlap_list, geo_models, fan_list, fan_thicknesses)
    # Apply faults to depth maps and age volume, and output faulted files
    f.apply_faulting_to_geomodels_and_depth_maps()
    # Build faulted lithology, net_to_gross and depth and randomised models
    f.build_faulted_property_geomodels(facies)

    # Create closures, remove false closures and and output closures
    closures = Closures(p, f, facies, onlap_list)
    closures.create_closures()
    closures.write_closure_volumes_to_disk()

    # Create 3D qc plot
    if p.qc_plots:
        try:
            plot_3D_closure_plot(p, closures)
        except ValueError:
            p.write_to_logfile("3D Closure Plotting Failed")

    # Create Rho, Vp, Vs volumes, apply Zoeppritz and write seismic volumes to disk
    seismic = SeismicVolume(p, f, closures)
    seismic.build_elastic_properties("inv_vel")
    seismic.build_seismic_volumes()

    try:
        rfc_raw = np.array(seismic.rfc_raw)
        closures.write_closure_info_to_log(rfc_raw[1:4, ...])
    except Exception as e:
        print(f"WARNING: write_closure_info_to_log failed: {e}")
        import traceback

        traceback.print_exc()

    elapsed_time = datetime.datetime.now() - p.start_time
    print("\n\n\n...elapsed time is {}".format(elapsed_time))

    try:
        p.write_to_logfile(
            f"elapsed_time: {elapsed_time}\n",
            mainkey="model_parameters",
            subkey="elapsed_time",
            val=elapsed_time,
        )
    except Exception as e:
        print(f"ERROR: write_to_logfile failed: {e}")

    try:
        p.write_sqldict_to_logfile(f"{p.work_subfolder}/sql_log.txt")
    except Exception as e:
        print(f"ERROR: write_sqldict_to_logfile failed: {e}")

    try:
        p.write_sqldict_to_db()
    except Exception as e:
        print(f"ERROR: write_sqldict_to_db failed: {e}")

    # Cleanup
    try:
        p.h5file.close()
    except Exception as e:
        print(f"ERROR: h5file.close failed: {e}")

    try:
        shutil.rmtree(p.temp_folder, ignore_errors=True)
    except Exception as e:
        print(f"ERROR: shutil.rmtree failed: {e}")

    try:
        os.chmod(p.work_subfolder, 0o777)
    except OSError:
        pass

    # Change back to original directory for next run
    os.chdir(p.current_dir)

    plt.close("all")

    return p.work_subfolder


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "-t",
        "--test_mode",
        help="Run in testing mode, number will g",
        default=None,
        type=int,
    )
    parser.add_argument(
        "-c", "--config_file", help="Provide model parameter file", required=True
    )
    parser.add_argument(
        "-n", "--num_runs", help="Number of models to create", default=1, type=int
    )
    parser.add_argument("-r", "--run_id", help="Run ID", default=None)
    parser.add_argument(
        "-d", "--date_stamp", help="Date stamp for folder naming", default=None
    )

    args = parser.parse_args()

    # Print args
    print("Input arguments used:")
    for arg in vars(args):
        print(f"\t* {arg}: {getattr(args, arg)}")

    for iRun in range(args.num_runs):
        # TODO Create a separate class to handle rpm randomization do these things need to be added to the config file?
        # Apply randomisation to the rock properties
        factor_dict = dict()
        factor_dict["layershiftsamples"] = int(np.random.triangular(35, 75, 125))
        factor_dict["RPshiftsamples"] = int(np.random.triangular(5, 11, 20))
        factor_dict["shalerho_factor"] = 1.0
        factor_dict["shalevp_factor"] = 1.0
        factor_dict["shalevs_factor"] = 1.0
        factor_dict["sandrho_factor"] = 1.0
        factor_dict["sandvp_factor"] = 1.0
        factor_dict["sandvs_factor"] = 1.0
        # Amplitude scaling factors for n, m ,f volumes
        factor_dict["nearfactor"] = 1.0
        factor_dict["midfactor"] = 1.0
        factor_dict["farfactor"] = 1.0
        # Build model using the selected rpm factors
        try:
            build_model(
                args.config_file,
                args.run_id,
                args.test_mode,
                rpm_factors=factor_dict,
                date_stamp=args.date_stamp,
            )
        except Exception as e:
            print(f"ERROR: build_model failed: {e}")
            import traceback

            traceback.print_exc()
            sys.exit(1)

    print("Main completed successfully, exiting with code 0")
    sys.exit(0)
