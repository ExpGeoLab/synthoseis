// API client for communicating with the backend

const API_BASE = '/api';

export interface ModelConfig {
  project: string;
  project_folder: string;
  work_folder: string;
  cube_shape: number[];
  incident_angles: number[];
  digi: number;
  infill_factor: number;
  initial_layer_stdev: number[];
  thickness_min: number;
  thickness_max: number;
  seabed_min_depth: number[];
  signal_to_noise_ratio_db: number[];
  bandwidth_low: number[];
  bandwidth_high: number[];
  bandwidth_ord: number;
  dip_factor_max: number;
  min_number_faults: number;
  max_number_faults: number;
  pad_samples: number;
  max_column_height: number[];
  closure_types: string[];
  min_closure_voxels_simple: number;
  min_closure_voxels_faulted: number;
  min_closure_voxels_onlap: number;
  sand_layer_thickness: number;
  sand_layer_fraction: { min: number; max: number };
  extra_qc_plots: boolean;
  verbose: boolean;
  partial_voxels: boolean;
  variable_shale_ng: boolean;
  basin_floor_fans: boolean;
  include_channels: boolean;
  include_salt: boolean;
  write_to_hdf: boolean;
  broadband_qc_volume: boolean;
  model_qc_volumes: boolean;
  multiprocess_bp: boolean;
}

export interface RunResponse {
  id: string;
  config_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  output_folder?: string;
  error_message?: string;
  config: ModelConfig;
  log_messages: string[];
  progress: number;
  current_step?: string;
}

export interface ConfigSummary {
  name: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  running_runs: number;
  pending_runs: number;
  // Dataset metrics
  total_datasets: number;
  completed_datasets: number;
  total_train_samples: number;
  total_val_samples: number;
}

export interface QCImage {
  name: string;
  title: string;
  description: string;
  path: string;
  url: string;
  thumbnail_url: string;
}

export const defaultConfig: ModelConfig = {
  project: "example",
  project_folder: "output/synthoseis_example",
  work_folder: "output",
  cube_shape: [300, 300, 1250],
  incident_angles: [7, 15, 24],
  digi: 4,
  infill_factor: 10,
  initial_layer_stdev: [7.0, 25.0],
  thickness_min: 2,
  thickness_max: 12,
  seabed_min_depth: [20, 50],
  signal_to_noise_ratio_db: [7.5, 12.5, 17.5],
  bandwidth_low: [3.0, 6.0],
  bandwidth_high: [20.0, 35.0],
  bandwidth_ord: 4,
  dip_factor_max: 2,
  min_number_faults: 1,
  max_number_faults: 6,
  pad_samples: 10,
  max_column_height: [150.0, 150.0],
  closure_types: ["simple", "faulted", "onlap"],
  min_closure_voxels_simple: 500,
  min_closure_voxels_faulted: 2500,
  min_closure_voxels_onlap: 500,
  sand_layer_thickness: 2,
  sand_layer_fraction: { min: 0.05, max: 0.25 },
  extra_qc_plots: true,
  verbose: true,
  partial_voxels: true,
  variable_shale_ng: false,
  basin_floor_fans: false,
  include_channels: false,
  include_salt: true,
  write_to_hdf: false,
  broadband_qc_volume: false,
  model_qc_volumes: true,
  multiprocess_bp: true,
};

// Dashboard API
export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_BASE}/dashboard`);
  return res.json();
}

// Runs API
export async function getRuns(status?: string): Promise<RunResponse[]> {
  const url = status ? `${API_BASE}/runs?status=${status}` : `${API_BASE}/runs`;
  const res = await fetch(url);
  return res.json();
}

export async function getRun(id: string): Promise<RunResponse> {
  const res = await fetch(`${API_BASE}/runs/${id}`);
  return res.json();
}

export async function createRun(configName: string, config: ModelConfig, numRuns: number = 1, runId?: string, testMode?: number): Promise<RunResponse> {
  const res = await fetch(`${API_BASE}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config_name: configName, config, num_runs: numRuns, run_id: runId, test_mode: testMode }),
  });
  return res.json();
}

export async function deleteRun(id: string): Promise<void> {
  await fetch(`${API_BASE}/runs/${id}`, { method: 'DELETE' });
}

export async function cancelRun(id: string): Promise<void> {
  await fetch(`${API_BASE}/runs/${id}/cancel`, { method: 'POST' });
}

export async function getRunQCImages(runId: string): Promise<QCImage[]> {
  const res = await fetch(`${API_BASE}/runs/${runId}/qc`);
  return res.json();
}

// Volume Types
export interface VolumeInfo {
  name: string;
  filename: string;
  shape: number[];
  path: string;
  url: string;
}

// Volumes API
export async function getRunVolumes(runId: string): Promise<VolumeInfo[]> {
  const res = await fetch(`${API_BASE}/runs/${runId}/volumes`);
  return res.json();
}

export function getVolumeSliceUrl(runId: string, volumeName: string, sliceIndex: number = 300, sliceType: string = 'depth'): string {
  return `${API_BASE}/runs/${runId}/volumes/${volumeName}?slice_index=${sliceIndex}&slice_type=${sliceType}`;
}

// Configs API
export async function getConfigs(): Promise<ConfigSummary[]> {
  const res = await fetch(`${API_BASE}/configs`);
  return res.json();
}

export async function getConfig(name: string): Promise<ModelConfig> {
  const res = await fetch(`${API_BASE}/configs/${name}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Failed to fetch config' }));
    throw new Error(errorData.detail || `Failed to fetch config: ${res.status}`);
  }
  return res.json();
}

export async function saveConfig(name: string, config: ModelConfig): Promise<void> {
  await fetch(`${API_BASE}/configs/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function deleteConfig(name: string): Promise<void> {
  await fetch(`${API_BASE}/configs/${name}`, { method: 'DELETE' });
}

export async function getDefaultConfig(): Promise<ModelConfig> {
  const res = await fetch(`${API_BASE}/configs/default/model`);
  return res.json();
}

// Rock Physics Types
export interface PolynomialCoeffs {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface RockTypeProperties {
  vp: PolynomialCoeffs;
  vs: PolynomialCoeffs;
  rho: PolynomialCoeffs;
}

export interface RockPhysicsConfig {
  name: string;
  shale: RockTypeProperties;
  brine_sand: RockTypeProperties;
  oil_sand: RockTypeProperties;
  gas_sand: RockTypeProperties;
}

export const defaultRockPhysics: RockPhysicsConfig = {
  name: "default",
  shale: {
    vp: { a: -0.00013, b: 0, c: 1.13, d: 1580 },
    vs: { a: -0.0001, b: 0, c: 0.96, d: 279 },
    rho: { a: 7.7e-12, b: -8.8e-08, c: 0.0004, d: 1.957 }
  },
  brine_sand: {
    vp: { a: -1.34e-05, b: 0, c: 0.49, d: 2317 },
    vs: { a: -1.0785e-05, b: 0, c: 0.391, d: 1007 },
    rho: { a: -7.8e-09, b: 0, c: 0.00012, d: 2.021 }
  },
  oil_sand: {
    vp: { a: -8.876e-06, b: 0, c: 0.505, d: 1998 },
    vs: { a: -1.126e-05, b: 0, c: 0.391, d: 1036 },
    rho: { a: -9.23e-09, b: 0, c: 0.00014, d: 1.916 }
  },
  gas_sand: {
    vp: { a: -3.216e-06, b: 0, c: 0.4796, d: 1996 },
    vs: { a: -1.0687e-05, b: 0, c: 0.3662, d: 1135 },
    rho: { a: -1.818e-08, b: 0, c: 0.000247, d: 1.612 }
  }
};

// Rock Physics API
export async function getRockPhysics(name: string): Promise<RockPhysicsConfig> {
  const res = await fetch(`${API_BASE}/rockphysics/${name}`);
  return res.json();
}

export async function saveRockPhysics(name: string, config: RockPhysicsConfig): Promise<void> {
  await fetch(`${API_BASE}/rockphysics/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function deleteRockPhysics(name: string): Promise<void> {
  await fetch(`${API_BASE}/rockphysics/${name}`, { method: 'DELETE' });
}

// Wavelet Types and API
export interface WaveletParams {
  wavelet_type: string;
  frequency: number;
  dt: number;
  convolutions: number;
  duration_ms: number;
}

export interface WaveletData {
  time: number[];
  amplitude: number[];
  params: WaveletParams;
}

export interface BatchWaveletData {
  wavelets: { time: number[]; amplitude: number[]; frequency: number }[];
  base_params: WaveletParams;
}

export const defaultWaveletParams: WaveletParams = {
  wavelet_type: "ricker",
  frequency: 25.0,
  dt: 4.0,
  convolutions: 2,
  duration_ms: 200.0,
};

export async function generateWavelet(params: WaveletParams): Promise<WaveletData> {
  const res = await fetch(`${API_BASE}/wavelets/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to generate wavelet');
  return res.json();
}

export async function generateWaveletBatch(params: WaveletParams, count: number = 3): Promise<BatchWaveletData> {
  const res = await fetch(`${API_BASE}/wavelets/generate-batch?count=${count}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to generate wavelets');
  return res.json();
}

// Fault Types
export interface FaultConfig {
  name: string;
  min_number_faults: number;
  max_number_faults: number;
  infill_factor: number;
  preferred_fault_modes: string[];
  preferred_noise_types: string[];
}

export const defaultFaultConfig: FaultConfig = {
  name: "default",
  min_number_faults: 1,
  max_number_faults: 6,
  infill_factor: 10,
  preferred_fault_modes: [],
  preferred_noise_types: [],
};

export async function getFaults(name: string): Promise<FaultConfig> {
  const res = await fetch(`${API_BASE}/faults/${name}`);
  return res.json();
}

export async function saveFaults(name: string, config: FaultConfig): Promise<void> {
  await fetch(`${API_BASE}/faults/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function deleteFaults(name: string): Promise<void> {
  await fetch(`${API_BASE}/faults/${name}`, { method: 'DELETE' });
}

// Dataset Types
export type DatasetTaskType = 'denoise' | 'facies' | 'salt' | 'interpolation' | 'reflection';
export type DatasetStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PatchConfig {
  size_x: number;
  size_y: number;
  size_z: number;
  extraction_mode: 'random' | 'grid' | 'manual';
  num_patches_per_volume: number;
  overlap: number;
}

export type AugmentationMethod = 'tz_stretch' | 'uniform_stretch' | 'horizontal_flip' | 'jitter';

export interface AugmentationConfig {
  enabled: boolean;
  methods: AugmentationMethod[];
  augment_factor: number;
  apply_to_train_only: boolean;
  seed: number;
  jitter_noise_factor: number;
  jitter_distributions: string[];
  flip_direction: string;
}

export interface DatasetConfig {
  name: string;
  task_type: DatasetTaskType;
  source_run_ids: string[];
  external_volumes: { path: string; name: string }[];
  patch_config: PatchConfig;
  train_split: number;
  val_split: number;
  normalize: boolean;
  normalization_method: 'standard' | 'minmax' | 'none';
  output_path?: string;
  include_volumes: string[];
  augmentation: AugmentationConfig;
  seed: number;
}

export interface DatasetSampleCounts {
  train: number;
  validation: number;
}

export interface DatasetResponse {
  id: string;
  name: string;
  status: DatasetStatus;
  task_type: DatasetTaskType;
  config: DatasetConfig;
  created_at: string;
  completed_at?: string;
  output_path?: string;
  sample_counts: DatasetSampleCounts;
  progress: number;
  current_step?: string;
  error_message?: string;
}

export interface DatasetPreview {
  sample_index: number;
  split: string;
  input_shape: number[];
  target_shape: number[];
  preview_url: string;
}

export const defaultDatasetConfig: DatasetConfig = {
  name: "",
  task_type: "denoise",
  source_run_ids: [],
  external_volumes: [],
  patch_config: {
    size_x: 48,
    size_y: 48,
    size_z: 1,
    extraction_mode: "random",
    num_patches_per_volume: 10,
    overlap: 0.0,
  },
  train_split: 0.8,
  val_split: 0.2,
  normalize: true,
  normalization_method: "standard",
  include_volumes: [],
  augmentation: {
    enabled: false,
    methods: ["tz_stretch"],
    augment_factor: 2,
    apply_to_train_only: true,
    seed: 42,
    jitter_noise_factor: 0.02,
    jitter_distributions: ["gaussian", "uniform", "laplace"],
    flip_direction: "random",
  },
  seed: 42,
};

// Dataset API
export async function getDatasets(): Promise<DatasetResponse[]> {
  const res = await fetch(`${API_BASE}/datasets`);
  return res.json();
}

export async function getDataset(id: string): Promise<DatasetResponse> {
  const res = await fetch(`${API_BASE}/datasets/${id}`);
  return res.json();
}

export async function createDataset(config: DatasetConfig): Promise<DatasetResponse> {
  const res = await fetch(`${API_BASE}/datasets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function deleteDataset(id: string): Promise<void> {
  await fetch(`${API_BASE}/datasets/${id}`, { method: 'DELETE' });
}

// Augmentation Types
export interface AugmentationJob {
  id: string;
  dataset_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  config: AugmentationConfig;
  created_at: string;
  completed_at?: string;
  samples_processed: number;
  total_samples: number;
  error_message?: string;
}

// Augmentation API
export async function augmentDataset(datasetId: string, config: AugmentationConfig): Promise<AugmentationJob> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/augment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function getAugmentationStatus(datasetId: string): Promise<{ status: string; jobs: AugmentationJob[] }> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/augment/status`);
  return res.json();
}

export async function listAugmentationJobs(): Promise<AugmentationJob[]> {
  const res = await fetch(`${API_BASE}/augment/jobs`);
  return res.json();
}

export async function deleteAugmentation(jobId: string): Promise<void> {
  await fetch(`${API_BASE}/augment/jobs/${jobId}`, { method: 'DELETE' });
}

// System Settings Types
export interface SystemSettings {
  auto_discover_historic_runs: boolean;
  work_folder: string;
  project_folder: string;
  last_discovery_scan?: string;
  discovered_runs_count: number;
}

export interface HistoricRunDiscovery {
  run_id: string;
  project: string;
  date_stamp: string;
  output_folder: string;
  discovered_at: string;
  is_test_mode: boolean;
  volume_count: number;
}

// System Settings API
export async function getSystemSettings(): Promise<SystemSettings> {
  const res = await fetch(`${API_BASE}/system/settings`);
  return res.json();
}

export async function updateSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
  const res = await fetch(`${API_BASE}/system/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function discoverHistoricRuns(autoImport: boolean = false): Promise<HistoricRunDiscovery[]> {
  const res = await fetch(`${API_BASE}/system/discover-runs?auto_import=${autoImport}`);
  return res.json();
}

export async function importHistoricRun(runId: string): Promise<RunResponse> {
  const res = await fetch(`${API_BASE}/system/import-run/${runId}`, {
    method: 'POST',
  });
  return res.json();
}

export async function runAutoDiscovery(): Promise<{ message: string; enabled: boolean }> {
  const res = await fetch(`${API_BASE}/system/run-discovery`, {
    method: 'POST',
  });
  return res.json();
}

export interface PathValidationResult {
  work_folder: {
    path: string;
    exists: boolean;
    is_directory: boolean;
  };
  project_folder: {
    path: string;
    exists: boolean;
    is_directory: boolean;
  };
  valid: boolean;
}

export async function validatePaths(workFolder: string, projectFolder: string): Promise<PathValidationResult> {
  const res = await fetch(`${API_BASE}/system/validate-paths`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ work_folder: workFolder, project_folder: projectFolder }),
  });
  return res.json();
}
