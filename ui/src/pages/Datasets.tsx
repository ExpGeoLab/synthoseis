import { useEffect, useState } from 'react'
import { Database, Plus, Trash2, Loader2, CheckCircle, AlertCircle, Clock, FolderOpen, Settings, Search, Archive, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { 
  getDatasets, createDataset, deleteDataset, getRuns, 
  getSystemSettings, updateSystemSettings, discoverHistoricRuns, runAutoDiscovery, validatePaths,
  augmentDataset, getAugmentationStatus, listAugmentationJobs, deleteAugmentation,
  DatasetResponse, DatasetConfig, RunResponse, defaultDatasetConfig,
  SystemSettings, HistoricRunDiscovery, PathValidationResult,
  AugmentationJob, AugmentationConfig
} from '@/lib/api'

const TASK_TYPES = [
  { id: 'denoise', name: 'Denoise', description: 'Remove noise from seismic', color: 'bg-blue-100 text-blue-800' },
  { id: 'facies', name: 'Facies', description: 'Classify seismic facies', color: 'bg-green-100 text-green-800' },
  { id: 'salt', name: 'Salt', description: 'Identify salt bodies', color: 'bg-amber-100 text-amber-800' },
  { id: 'interpolation', name: 'Interpolation', description: 'Reconstruct missing traces', color: 'bg-purple-100 text-purple-800' },
  { id: 'reflection', name: 'Reflection', description: 'Estimate reflectivity', color: 'bg-pink-100 text-pink-800' },
] as const

const EXTRACTION_MODES = [
  { id: 'random', name: 'Random', description: 'Randomly extract patches' },
  { id: 'grid', name: 'Grid', description: 'Systematic grid sampling' },
  { id: 'manual', name: 'Manual (Phase 2)', description: 'User-defined regions' },
] as const

function StatusBadge({ status }: { status: string }) {
  const styles = {
    pending: 'bg-gray-100 text-gray-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  }
  const icons = {
    pending: Clock,
    processing: Loader2,
    completed: CheckCircle,
    failed: AlertCircle,
  }
  const Icon = icons[status as keyof typeof icons] || Clock
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] || styles.pending}`}>
      <Icon className={`w-3 h-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function Datasets() {
  const [datasets, setDatasets] = useState<DatasetResponse[]>([])
  const [runs, setRuns] = useState<RunResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<DatasetConfig>(defaultDatasetConfig)
  const [selectedRuns, setSelectedRuns] = useState<string[]>([])
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null)
  const [historicRuns, setHistoricRuns] = useState<HistoricRunDiscovery[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [pathValidation, setPathValidation] = useState<PathValidationResult | null>(null)
  const [validatingPaths, setValidatingPaths] = useState(false)
  const [augmentationJobs, setAugmentationJobs] = useState<AugmentationJob[]>([])
  const [augmentingDataset, setAugmentingDataset] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    loadSystemSettings()
    // Auto-refresh every 5 seconds
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const [datasetsData, runsData, jobsData] = await Promise.all([
        getDatasets(),
        getRuns('completed'),
        listAugmentationJobs()
      ])
      setDatasets(datasetsData)
      setRuns(runsData)
      setAugmentationJobs(jobsData)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadSystemSettings() {
    try {
      const settings = await getSystemSettings()
      setSystemSettings(settings)
    } catch (error) {
      console.error('Failed to load system settings:', error)
      // Initialize with default empty settings on error
      setSystemSettings({
        auto_discover_historic_runs: false,
        work_folder: '',
        project_folder: '',
        discovered_runs_count: 0
      })
    }
  }

  async function handleToggleAutoDiscovery() {
    if (!systemSettings) return
    
    try {
      const newValue = !systemSettings.auto_discover_historic_runs
      await updateSystemSettings({ auto_discover_historic_runs: newValue })
      setSystemSettings({ ...systemSettings, auto_discover_historic_runs: newValue })
      toast.success(`Auto-discovery ${newValue ? 'enabled' : 'disabled'}`)
      
      if (newValue) {
        // Run discovery immediately when enabled
        handleDiscoverRuns(true)
      }
    } catch (error) {
      toast.error('Failed to update settings')
      console.error(error)
    }
  }

  async function handleDiscoverRuns(autoImport: boolean = false) {
    setDiscovering(true)
    try {
      const discovered = await discoverHistoricRuns(autoImport)
      setHistoricRuns(discovered)
      
      if (autoImport) {
        toast.success(`Imported ${discovered.length} historic runs`)
        // Refresh runs list
        loadData()
      } else {
        toast.info(`Found ${discovered.length} historic runs`)
      }
    } catch (error) {
      toast.error('Failed to discover runs')
      console.error(error)
    } finally {
      setDiscovering(false)
    }
  }

  async function handleCreate() {
    if (!config.name.trim()) {
      toast.error('Please enter a dataset name')
      return
    }
    if (selectedRuns.length === 0) {
      toast.error('Please select at least one run')
      return
    }

    try {
      const newDataset = await createDataset({
        ...config,
        source_run_ids: selectedRuns,
      })
      toast.success('Dataset creation started')
      setShowCreate(false)
      setConfig(defaultDatasetConfig)
      setSelectedRuns([])
      setDatasets(prev => [newDataset, ...prev])
    } catch (error) {
      toast.error('Failed to create dataset')
      console.error(error)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this dataset?')) return
    try {
      await deleteDataset(id)
      toast.success('Dataset deleted')
      setDatasets(prev => prev.filter(d => d.id !== id))
    } catch (error) {
      toast.error('Failed to delete dataset')
      console.error(error)
    }
  }

  function toggleRunSelection(runId: string) {
    setSelectedRuns(prev => 
      prev.includes(runId) 
        ? prev.filter(id => id !== runId)
        : [...prev, runId]
    )
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Datasets</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create SFM-compatible training datasets from synthetic seismic runs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`inline-flex items-center gap-2 px-4 py-2 border rounded-md transition-colors ${
              showSettings ? 'bg-gray-100 border-gray-300' : 'hover:bg-muted'
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
          >
            {showCreate ? <Settings className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showCreate ? 'Cancel' : 'New Dataset'}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white rounded-lg border p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">System Settings</h3>
              <p className="text-sm text-muted-foreground">Configure historic run discovery</p>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              X
            </button>
          </div>

          {/* Auto-discovery Toggle */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-medium">Auto-discover Historic Runs</h4>
                <p className="text-sm text-muted-foreground">
                  Automatically scan disk for runs created outside the web UI
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={systemSettings?.auto_discover_historic_runs || false}
                  onChange={handleToggleAutoDiscovery}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {systemSettings?.last_discovery_scan && (
              <p className="text-xs text-muted-foreground">
                Last scan: {new Date(systemSettings.last_discovery_scan).toLocaleString()}
                {systemSettings.discovered_runs_count > 0 && (
                  <span> • {systemSettings.discovered_runs_count} runs discovered</span>
                )}
              </p>
            )}
          </div>

          {/* Manual Discovery */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium mb-2">Manual Discovery</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Scan disk for historic runs and optionally import them into the system
            </p>
            
            {historicRuns.length > 0 && !discovering && (
              <div className="mb-4 p-3 bg-white rounded border">
                <p className="font-medium text-sm mb-2">
                  Found {historicRuns.length} historic runs
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {historicRuns.slice(0, 5).map((run) => (
                    <div key={run.run_id} className="text-xs text-muted-foreground flex justify-between">
                      <span>{run.run_id}</span>
                      <span>{run.volume_count} volumes</span>
                    </div>
                  ))}
                  {historicRuns.length > 5 && (
                    <p className="text-xs text-muted-foreground">
                      ...and {historicRuns.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => handleDiscoverRuns(false)}
                disabled={discovering}
                className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-white disabled:opacity-50"
              >
                {discovering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Scan Only
              </button>
              <button
                onClick={() => handleDiscoverRuns(true)}
                disabled={discovering}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {discovering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Archive className="w-4 h-4" />
                )}
                Scan & Import
              </button>
            </div>
          </div>

          {/* Folder Paths */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Search Paths</h4>
              <p className="text-xs text-muted-foreground">
                Configure where to look for historic runs
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Work Folder</label>
                <input
                  type="text"
                  value={systemSettings?.work_folder || ''}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setSystemSettings(prev => {
                      if (prev) {
                        return { ...prev, work_folder: newValue };
                      }
                      // If prev is null, create a new settings object
                      return {
                        auto_discover_historic_runs: false,
                        work_folder: newValue,
                        project_folder: '',
                        discovered_runs_count: 0
                      };
                    });
                  }}
                  placeholder="e.g., D:\scratch or /scratch"
                  className="w-full border rounded-md px-3 py-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Scanned for test mode runs (e.g., *_test_mode_/seismic__*)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Project Folder</label>
                <input
                  type="text"
                  value={systemSettings?.project_folder || ''}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setSystemSettings(prev => {
                      if (prev) {
                        return { ...prev, project_folder: newValue };
                      }
                      // If prev is null, create a new settings object
                      return {
                        auto_discover_historic_runs: false,
                        work_folder: '',
                        project_folder: newValue,
                        discovered_runs_count: 0
                      };
                    });
                  }}
                  placeholder="e.g., D:\scratch\synthoseis_example"
                  className="w-full border rounded-md px-3 py-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Scanned for normal mode runs (e.g., project__*)
                </p>
              </div>
            </div>

            {/* Path Validation Results */}
            {pathValidation && (
              <div className="p-3 bg-white rounded border space-y-2">
                <p className="text-sm font-medium">Path Validation:</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    {pathValidation.work_folder.exists ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className={pathValidation.work_folder.exists ? 'text-green-700' : 'text-red-700'}>
                      Work folder {pathValidation.work_folder.exists ? 'exists' : 'not found'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {pathValidation.project_folder.exists ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className={pathValidation.project_folder.exists ? 'text-green-700' : 'text-red-700'}>
                      Project folder {pathValidation.project_folder.exists ? 'exists' : 'not found'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={async () => {
                  if (!systemSettings) return
                  setValidatingPaths(true)
                  try {
                    const validation = await validatePaths(
                      systemSettings.work_folder,
                      systemSettings.project_folder
                    )
                    setPathValidation(validation)
                    if (validation.valid) {
                      toast.success('All paths are valid')
                    } else {
                      toast.warning('Some paths do not exist')
                    }
                  } catch (error) {
                    toast.error('Failed to validate paths')
                    console.error(error)
                  } finally {
                    setValidatingPaths(false)
                  }
                }}
                disabled={validatingPaths}
                className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-white disabled:opacity-50"
              >
                {validatingPaths ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Validate Paths
              </button>
              <button
                onClick={async () => {
                  if (!systemSettings) return
                  try {
                    await updateSystemSettings({
                      work_folder: systemSettings.work_folder,
                      project_folder: systemSettings.project_folder
                    })
                    toast.success('Search paths saved')
                  } catch (error) {
                    toast.error('Failed to save paths')
                    console.error(error)
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
              >
                Save Paths
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Dataset Form */}
      {showCreate && (
        <div className="bg-white rounded-lg border p-6 space-y-6">
          <h3 className="font-semibold text-lg">Create New Dataset</h3>
          
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Dataset Name</label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
                placeholder="e.g., denoise_dataset_v1"
                className="w-full border rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Output Path (optional)</label>
              <input
                type="text"
                value={config.output_path || ''}
                onChange={(e) => setConfig({ ...config, output_path: e.target.value || undefined })}
                placeholder="Auto-generated if empty"
                className="w-full border rounded-md px-3 py-2"
              />
            </div>
          </div>

          {/* Task Type Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Task Type</label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {TASK_TYPES.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setConfig({ ...config, task_type: task.id as any })}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    config.task_type === task.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-1 ${task.color}`}>
                    {task.name}
                  </span>
                  <p className="text-xs text-muted-foreground">{task.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Source Runs Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Source Runs</label>
            <p className="text-xs text-muted-foreground mb-2">
              Select completed runs to extract volumes from
            </p>
            {config.task_type === 'reflection' && (
              <div className="mb-2 p-2 bg-pink-50 rounded border border-pink-200">
                <p className="text-xs text-pink-800">
                  <strong>Reflection Task:</strong> Will automatically filter for impedance volumes (vp, rho, velocity, density, impedance)
                </p>
              </div>
            )}
            {config.task_type === 'denoise' && (
              <div className="mb-2 p-2 bg-blue-50 rounded border border-blue-200">
                <p className="text-xs text-blue-800">
                  <strong>Denoise Task:</strong> Will automatically filter for seismic volumes (seismic, RFC, cumsum)
                </p>
              </div>
            )}
            <div className="border rounded-lg max-h-40 overflow-y-auto">
              {runs.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No completed runs available. Complete a run first.
                </div>
              ) : (
                runs.map((run) => (
                  <label
                    key={run.id}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 border-b last:border-b-0 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRuns.includes(run.id)}
                      onChange={() => toggleRunSelection(run.id)}
                      className="rounded border-gray-300"
                    />
                    <div className="flex-1">
                      <span className="font-medium text-sm">{run.config_name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(run.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <StatusBadge status={run.status} />
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Patch Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Patch Size X</label>
              <input
                type="number"
                value={config.patch_config.size_x}
                onChange={(e) => setConfig({
                  ...config,
                  patch_config: { ...config.patch_config, size_x: parseInt(e.target.value) }
                })}
                className="w-full border rounded-md px-3 py-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Must be ≤ volume X dimension (e.g., 48 for 50x50x1259 volumes)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Patch Size Y</label>
              <input
                type="number"
                value={config.patch_config.size_y}
                onChange={(e) => setConfig({
                  ...config,
                  patch_config: { ...config.patch_config, size_y: parseInt(e.target.value) }
                })}
                className="w-full border rounded-md px-3 py-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Must be ≤ volume Y dimension (e.g., 48 for 50x50x1259 volumes)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Patches per Volume</label>
              <input
                type="number"
                value={config.patch_config.num_patches_per_volume}
                onChange={(e) => setConfig({
                  ...config,
                  patch_config: { ...config.patch_config, num_patches_per_volume: parseInt(e.target.value) }
                })}
                className="w-full border rounded-md px-3 py-2"
              />
            </div>
          </div>

          {/* Extraction Mode */}
          <div>
            <label className="block text-sm font-medium mb-2">Extraction Mode</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {EXTRACTION_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setConfig({
                    ...config,
                    patch_config: { ...config.patch_config, extraction_mode: mode.id as any }
                  })}
                  disabled={mode.id === 'manual'}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    config.patch_config.extraction_mode === mode.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  } ${mode.id === 'manual' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <p className="font-medium text-sm">{mode.name}</p>
                  <p className="text-xs text-muted-foreground">{mode.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Augmentation Configuration */}
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-semibold text-purple-900">Data Augmentation</h4>
                <p className="text-sm text-purple-700">
                  Generate augmented training samples automatically
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.augmentation.enabled}
                  onChange={(e) => setConfig({
                    ...config,
                    augmentation: { ...config.augmentation, enabled: e.target.checked }
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {config.augmentation.enabled && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Augmentation Methods</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'tz_stretch', name: 'Time-Depth Stretch', description: 'Simulates time-depth conversion effects' },
                      { id: 'uniform_stretch', name: 'Uniform Stretch', description: 'Random stretch/squeeze in all dimensions' },
                      { id: 'horizontal_flip', name: 'Flip', description: 'Mirror data horizontally/vertically' },
                      { id: 'jitter', name: 'Jitter (Noise)', description: 'Add random noise to prevent overfitting (input only)' },
                    ].map((method) => (
                      <label
                        key={method.id}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                          config.augmentation.methods.includes(method.id as any)
                            ? 'bg-purple-100 border-purple-300'
                            : 'bg-white border-gray-200 hover:border-purple-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={config.augmentation.methods.includes(method.id as any)}
                          onChange={(e) => {
                            const methods = e.target.checked
                              ? [...config.augmentation.methods, method.id as any]
                              : config.augmentation.methods.filter(m => m !== method.id)
                            setConfig({
                              ...config,
                              augmentation: { ...config.augmentation, methods }
                            })
                          }}
                          className="rounded border-gray-300"
                        />
                        <div>
                          <p className="text-sm font-medium">{method.name}</p>
                          <p className="text-xs text-gray-500">{method.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Flip Configuration */}
                {config.augmentation.methods.includes('horizontal_flip' as any) && (
                  <div className="p-3 bg-blue-50 rounded border border-blue-200">
                    <label className="block text-sm font-medium mb-2">Flip Direction</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'random', name: 'Random', description: 'Choose per sample' },
                        { id: 'horizontal', name: 'Horizontal', description: 'Mirror along X axis' },
                        { id: 'vertical', name: 'Vertical', description: 'Mirror along Y axis' },
                        { id: 'both', name: 'Both', description: 'Flip both axes' },
                      ].map((dir) => (
                        <label
                          key={dir.id}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border cursor-pointer transition-all ${
                            config.augmentation.flip_direction === dir.id
                              ? 'bg-blue-100 border-blue-300'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name="flip_direction"
                            value={dir.id}
                            checked={config.augmentation.flip_direction === dir.id}
                            onChange={(e) => setConfig({
                              ...config,
                              augmentation: { ...config.augmentation, flip_direction: e.target.value }
                            })}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">{dir.name}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-blue-600 mt-2">
                      <strong>Note:</strong> Flip is applied to both input and labels
                    </p>
                  </div>
                )}

                {/* Jitter Configuration */}
                {config.augmentation.methods.includes('jitter' as any) && (
                  <div className="p-3 bg-orange-50 rounded border border-orange-200">
                    <label className="block text-sm font-medium mb-2">
                      Jitter Noise Level: {(config.augmentation.jitter_noise_factor * 100).toFixed(2)}%
                    </label>
                    <input
                      type="range"
                      min="0.0001"
                      max="0.50"
                      step="0.0001"
                      value={config.augmentation.jitter_noise_factor}
                      onChange={(e) => setConfig({
                        ...config,
                        augmentation: { 
                          ...config.augmentation, 
                          jitter_noise_factor: parseFloat(e.target.value) 
                        }
                      })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0.01% (subtle)</span>
                      <span>2% (default)</span>
                      <span>50% (extreme)</span>
                    </div>
                    
                    <label className="block text-sm font-medium mt-3 mb-2">Noise Distributions</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'gaussian', name: 'Gaussian', description: 'Normal distribution' },
                        { id: 'uniform', name: 'Uniform', description: 'Even distribution' },
                        { id: 'laplace', name: 'Laplace', description: 'Heavy tails' },
                      ].map((dist) => (
                        <label
                          key={dist.id}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border cursor-pointer transition-all ${
                            config.augmentation.jitter_distributions.includes(dist.id)
                              ? 'bg-orange-100 border-orange-300'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={config.augmentation.jitter_distributions.includes(dist.id)}
                            onChange={(e) => {
                              const dists = e.target.checked
                                ? [...config.augmentation.jitter_distributions, dist.id]
                                : config.augmentation.jitter_distributions.filter(d => d !== dist.id)
                              setConfig({
                                ...config,
                                augmentation: { 
                                  ...config.augmentation, 
                                  jitter_distributions: dists 
                                }
                              })
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">{dist.name}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-orange-600 mt-2">
                      <strong>Note:</strong> Jitter is applied to INPUT data only. Labels remain clean for accurate training targets.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Augmentation Factor: {config.augmentation.augment_factor}x
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={config.augmentation.augment_factor}
                      onChange={(e) => setConfig({
                        ...config,
                        augmentation: { ...config.augmentation, augment_factor: parseInt(e.target.value) }
                      })}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Creates {config.augmentation.augment_factor} augmented versions per sample
                    </p>
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.augmentation.apply_to_train_only}
                        onChange={(e) => setConfig({
                          ...config,
                          augmentation: { ...config.augmentation, apply_to_train_only: e.target.checked }
                        })}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">Apply to training data only</span>
                    </label>
                  </div>
                </div>

                <div className="p-3 bg-purple-100 rounded">
                  <p className="text-sm text-purple-800">
                    <strong>Result:</strong> {Math.round((selectedRuns.length * config.patch_config.num_patches_per_volume * config.train_split * config.augmentation.augment_factor))} augmented samples will be created
                  </p>
                  {config.augmentation.methods.includes('jitter' as any) && (
                    <p className="text-xs text-purple-600 mt-1">
                      Using {config.augmentation.jitter_distributions.length} noise distribution(s) at {(config.augmentation.jitter_noise_factor * 100).toFixed(2)}% level
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Train/Val Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Training Split: {(config.train_split * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="50"
                max="90"
                value={config.train_split * 100}
                onChange={(e) => {
                  const train = parseInt(e.target.value) / 100
                  setConfig({ ...config, train_split: train, val_split: 1 - train })
                }}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Validation Split: {(config.val_split * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="10"
                max="50"
                value={config.val_split * 100}
                disabled
                className="w-full opacity-50"
              />
            </div>
          </div>

          {/* Normalization */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.normalize}
                onChange={(e) => setConfig({ ...config, normalize: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium">Normalize data</span>
            </label>
            {config.normalize && (
              <select
                value={config.normalization_method}
                onChange={(e) => setConfig({ ...config, normalization_method: e.target.value as any })}
                className="border rounded-md px-2 py-1 text-sm"
              >
                <option value="standard">Standard (Z-score)</option>
                <option value="minmax">Min-Max</option>
              </select>
            )}
          </div>

          {/* Create Button */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button
              onClick={() => {
                setShowCreate(false)
                setConfig(defaultDatasetConfig)
                setSelectedRuns([])
              }}
              className="px-4 py-2 border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
            >
              Create Dataset
            </button>
          </div>
        </div>
      )}

      {/* Dataset List */}
      <div className="bg-white rounded-lg border">
        {datasets.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No datasets yet. Create your first dataset to get started.</p>
          </div>
        ) : (
          <div className="divide-y">
            {datasets.map((dataset) => {
              const taskType = TASK_TYPES.find(t => t.id === dataset.task_type)
              return (
                <div key={dataset.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold">{dataset.name}</h3>
                        <StatusBadge status={dataset.status} />
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${taskType?.color || 'bg-gray-100'}`}>
                          {taskType?.name || dataset.task_type}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Created {new Date(dataset.created_at).toLocaleString()}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{dataset.sample_counts.train} train samples</span>
                        <span>{dataset.sample_counts.validation} validation samples</span>
                        {(() => {
                          const job = augmentationJobs.find(j => j.dataset_id === dataset.id)
                          if (job) {
                            if (job.status === 'completed') {
                              return (
                                <span className="flex items-center gap-1 text-green-600">
                                  <CheckCircle className="w-3 h-3" />
                                  {job.total_samples} augmented
                                </span>
                              )
                            } else if (job.status === 'processing') {
                              return (
                                <span className="flex items-center gap-1 text-blue-600">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Augmenting... {job.samples_processed}/{job.total_samples}
                                </span>
                              )
                            } else if (job.status === 'failed') {
                              return (
                                <span className="flex items-center gap-1 text-red-600">
                                  <AlertCircle className="w-3 h-3" />
                                  Augmentation failed
                                </span>
                              )
                            }
                          }
                          return null
                        })()}
                        {dataset.current_step && dataset.status === 'processing' && (
                          <span className="flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {dataset.current_step}
                          </span>
                        )}
                      </div>
                      {dataset.status === 'failed' && dataset.error_message && (
                        <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                          <strong>Error:</strong> {dataset.error_message}
                        </div>
                      )}
                      {dataset.progress > 0 && dataset.status === 'processing' && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 transition-all duration-300"
                              style={{ width: `${dataset.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {dataset.status === 'completed' && !augmentationJobs.find(j => j.dataset_id === dataset.id) && (
                        <button
                          onClick={async () => {
                            try {
                              setAugmentingDataset(dataset.id)
                              await augmentDataset(dataset.id, {
                                enabled: true,
                                methods: ['tz_stretch'],
                                augment_factor: 2,
                                apply_to_train_only: true,
                                seed: 42
                              })
                              toast.success('Augmentation started')
                              loadData()
                            } catch (error) {
                              toast.error('Failed to start augmentation')
                              console.error(error)
                            } finally {
                              setAugmentingDataset(null)
                            }
                          }}
                          disabled={augmentingDataset === dataset.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-md disabled:opacity-50"
                          title="Augment dataset"
                        >
                          {augmentingDataset === dataset.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Database className="w-3 h-3" />
                          )}
                          Augment
                        </button>
                      )}
                      {dataset.output_path && dataset.status === 'completed' && (
                        <button
                          onClick={() => {
                            // Open folder - would need electron or similar for actual implementation
                            toast.info(`Dataset location: ${dataset.output_path}`)
                          }}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                          title="Open folder"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(dataset.id)}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                        title="Delete dataset"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">About Dataset Creation</h4>
        <p className="text-sm text-blue-800">
          Datasets are created in SFM-compatible format with float32 binary files (.dat). 
          Select completed SynToSeis runs as the source, choose your task type, and configure 
          patch extraction parameters. The dataset will be automatically split into training 
          and validation sets for model training.
        </p>
      </div>
    </div>
  )
}
