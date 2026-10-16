import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, Download, Upload, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getConfigs, getConfig, saveConfig, deleteConfig, getDefaultConfig, ModelConfig, ConfigSummary } from '@/lib/api'

interface ParamDefinition {
  name: string
  type: 'string' | 'number' | 'array' | 'boolean' | 'object' | 'number_array' | 'string_array'
  default: unknown
  description: string
  min?: number
  max?: number
  step?: number
}

const paramDefinitions: Record<string, ParamDefinition> = {
  project: {
    name: 'Project',
    type: 'string',
    default: 'example',
    description: 'Name of project. Used to select the rock property model associated with the project. Must match a rockphysics module name (e.g., "example", "abc").'
  },
  project_folder: {
    name: 'Project Folder',
    type: 'string',
    default: '/scratch/synthoseis_example',
    description: 'Output directory for generated models. Must be a valid path where the user has write permissions.'
  },
  work_folder: {
    name: 'Work Folder',
    type: 'string',
    default: '/scratch',
    description: 'Temporary folder used for storing intermediate data. This folder is deleted on model completion.'
  },
  cube_shape: {
    name: 'Cube Shape',
    type: 'number_array',
    default: [300, 300, 1250],
    description: 'Number of samples in [X, Y, Z] for output seismic data. Larger values produce higher resolution but require more memory.'
  },
  incident_angles: {
    name: 'Incident Angles',
    type: 'number_array',
    default: [7, 15, 24],
    description: 'Central angle for the output seismic angle-stacks (in degrees). Typically: near=7°, mid=15°, far=24°.'
  },
  digi: {
    name: 'Digitization',
    type: 'number',
    default: 4,
    description: 'Vertical sampling rate in milliseconds. Lower values give higher resolution but larger data volumes.'
  },
  infill_factor: {
    name: 'Infill Factor',
    type: 'number',
    default: 10,
    description: 'Initial oversampling multiplier in the Z direction. Due to memory constraints, this is only used to construct the initial, unfaulted horizons. Higher values produce smoother layers but use more memory.'
  },
  initial_layer_stdev: {
    name: 'Initial Layer Stdev',
    type: 'number_array',
    default: [7.0, 25.0],
    description: 'Standard deviation of the depth of initial horizon at the base of the model. Random value is chosen between [low, high] range. Controls the initial roughness of the geological model.'
  },
  thickness_min: {
    name: 'Minimum Layer Thickness',
    type: 'number',
    default: 2,
    description: 'Minimum thickness of layers in samples. Controls the thinnest geological layer that can be created.'
  },
  thickness_max: {
    name: 'Maximum Layer Thickness',
    type: 'number',
    default: 12,
    description: 'Maximum thickness of layers in samples. Controls the thickest geological layer that can be created.'
  },
  seabed_min_depth: {
    name: 'Seabed Minimum Depth',
    type: 'number_array',
    default: [20, 50],
    description: 'Random thickness layers are "deposited" on top of previous layers. When a horizon\'s minimum depth is below this value, this becomes the top-most horizon (usually the seabed). Value in samples.'
  },
  signal_to_noise_ratio_db: {
    name: 'Signal to Noise Ratio (dB)',
    type: 'number_array',
    default: [7.5, 12.5, 17.5],
    description: 'Signal to noise ratio in decibels to control the noise level of the output seismic data. Random value chosen from triangular distribution [left, mode, right]. Higher values = cleaner data.'
  },
  bandwidth_low: {
    name: 'Bandwidth Low',
    type: 'number_array',
    default: [3.0, 6.0],
    description: 'Bandpass low-cut frequency in Hz. Chosen randomly between [low, high]. Controls the low-frequency content of the seismic signal.'
  },
  bandwidth_high: {
    name: 'Bandwidth High',
    type: 'number_array',
    default: [20.0, 35.0],
    description: 'Bandpass high-cut frequency in Hz. Chosen randomly between [low, high]. Controls the high-frequency content of the seismic signal.'
  },
  bandwidth_ord: {
    name: 'Bandwidth Order',
    type: 'number',
    default: 4,
    description: 'Order of the slope used in the bandpass filter. Higher values create steeper filter roll-off.'
  },
  dip_factor_max: {
    name: 'Dip Factor Maximum',
    type: 'number',
    default: 2,
    description: 'A scaling factor applied to the dip of each layer. Higher values create steeper geological dips.'
  },
  min_number_faults: {
    name: 'Minimum Number of Faults',
    type: 'number',
    default: 1,
    description: 'Minimum number of faults in the model. Faults add structural complexity to the geological model.'
  },
  max_number_faults: {
    name: 'Maximum Number of Faults',
    type: 'number',
    default: 6,
    description: 'Maximum number of faults in the model. Controls the maximum structural complexity from faulting.'
  },
  pad_samples: {
    name: 'Padding Samples',
    type: 'number',
    default: 10,
    description: 'Additional padding in Z-direction to avoid edge effects, given in samples. Helps prevent artifacts at model boundaries.'
  },
  max_column_height: {
    name: 'Maximum Column Height',
    type: 'number_array',
    default: [150.0, 150.0],
    description: 'Maximum vertical height of column in a 3D closure (trap). Used to identify valid hydrocarbon closures.'
  },
  closure_types: {
    name: 'Closure Types',
    type: 'string_array',
    default: ['simple', 'faulted', 'onlap'],
    description: 'Enables specific closure types: "simple" (4-way structural), "faulted" (3-way fault-dependent), "onlap" (stratigraphic).'
  },
  min_closure_voxels_simple: {
    name: 'Min Simple Closure Voxels',
    type: 'number',
    default: 500,
    description: 'Oil or gas filled simple closures with fewer voxels than this threshold will be filled with brine instead. Filters out small uneconomic closures.'
  },
  min_closure_voxels_faulted: {
    name: 'Min Faulted Closure Voxels',
    type: 'number',
    default: 2500,
    description: 'Minimum voxel threshold for faulted closures. Higher threshold than simple closures due to complexity.'
  },
  min_closure_voxels_onlap: {
    name: 'Min Onlap Closure Voxels',
    type: 'number',
    default: 500,
    description: 'Minimum voxel threshold for stratigraphic (onlap) closures.'
  },
  sand_layer_thickness: {
    name: 'Sand Layer Thickness',
    type: 'number',
    default: 2,
    description: 'Average thickness of stacked sand layers a priori, given in number of layers. Controls sand package thickness.'
  },
  sand_layer_fraction: {
    name: 'Sand Layer Fraction',
    type: 'object',
    default: { min: 0.05, max: 0.25 },
    description: 'Average percentage of sand layers in model a priori. Random value chosen between min and max. Higher = more sand-prone basin.'
  },
  extra_qc_plots: {
    name: 'Extra QC Plots',
    type: 'boolean',
    default: true,
    description: 'Switch to turn on/off additional QC output PNG plots. Generates visual quality control images of the model.'
  },
  verbose: {
    name: 'Verbose',
    type: 'boolean',
    default: true,
    description: 'Switch to turn on/off verbose logging. More detailed console output when enabled.'
  },
  partial_voxels: {
    name: 'Partial Voxels',
    type: 'boolean',
    default: true,
    description: 'If true, calculate an average property inside voxels that span multiple layers. More accurate but slower.'
  },
  variable_shale_ng: {
    name: 'Variable Shale Net-to-Gross',
    type: 'boolean',
    default: false,
    description: 'If true, enable net-to-gross to vary laterally in shale layers. If false, uses net-to-gross of 0 (all shale).'
  },
  basin_floor_fans: {
    name: 'Basin Floor Fans',
    type: 'boolean',
    default: false,
    description: 'Switch to turn on/off basin floor fan-shaped features in layers. Adds turbidite fan geobodies.'
  },
  include_channels: {
    name: 'Include Channels',
    type: 'boolean',
    default: false,
    description: 'Switch to turn on/off fluvial channel belts. Inserts one or two meandering point-bar sand bodies, which adds roughly 10-30 seconds to model generation.'
  },
  include_salt: {
    name: 'Include Salt',
    type: 'boolean',
    default: true,
    description: 'Switch to turn on/off salt bodies. Adds allochthonous salt structures to the model.'
  },
  write_to_hdf: {
    name: 'Write to HDF',
    type: 'boolean',
    default: false,
    description: 'Write QC and additional volumes to HDF file. Creates large output files for detailed analysis.'
  },
  broadband_qc_volume: {
    name: 'Broadband QC Volume',
    type: 'boolean',
    default: false,
    description: 'Output a bandpassed seismic data with a low-cut of 2Hz and high-cut of 90Hz to simulate broadband seismic.'
  },
  model_qc_volumes: {
    name: 'Model QC Volumes',
    type: 'boolean',
    default: true,
    description: 'Save QC volumes to disk. Generates intermediate model volumes for quality control.'
  },
  multiprocess_bp: {
    name: 'Multiprocess Bandpass',
    type: 'boolean',
    default: true,
    description: 'Use multiprocessing to speed up the bandpass operations. Significantly faster on multi-core systems.'
  }
}

const configSections = [
  { 
    id: 'model',
    name: 'Model Configuration', 
    description: 'Basic model parameters and output settings',
    fields: ['project', 'project_folder', 'work_folder', 'cube_shape', 'incident_angles', 'digi', 'infill_factor'] 
  },
  { 
    id: 'layers',
    name: 'Layer Parameters', 
    description: 'Geological layer thickness and depth settings',
    fields: ['initial_layer_stdev', 'thickness_min', 'thickness_max', 'seabed_min_depth', 'sand_layer_thickness', 'sand_layer_fraction'] 
  },
  { 
    id: 'seismic',
    name: 'Seismic Parameters', 
    description: 'Seismic signal generation and filtering',
    fields: ['signal_to_noise_ratio_db', 'bandwidth_low', 'bandwidth_high', 'bandwidth_ord', 'dip_factor_max'] 
  },
  { 
    id: 'faults',
    name: 'Fault Configuration', 
    description: 'Structural faulting parameters',
    fields: ['min_number_faults', 'max_number_faults', 'pad_samples'] 
  },
  { 
    id: 'closures',
    name: 'Closure/Trap Settings', 
    description: 'Hydrocarbon closure detection parameters',
    fields: ['closure_types', 'min_closure_voxels_simple', 'min_closure_voxels_faulted', 'min_closure_voxels_onlap', 'max_column_height'] 
  },
  { 
    id: 'features',
    name: 'Geological Features', 
    description: 'Special geological features to include',
    fields: ['basin_floor_fans', 'include_channels', 'include_salt', 'variable_shale_ng', 'partial_voxels'] 
  },
  { 
    id: 'output',
    name: 'Output & QC', 
    description: 'Output options and quality control settings',
    fields: ['extra_qc_plots', 'verbose', 'write_to_hdf', 'broadband_qc_volume', 'model_qc_volumes', 'multiprocess_bp'] 
  },
]

function renderField(key: string, value: unknown, onChange: (key: string, value: unknown) => void, paramDef: ParamDefinition) {
  if (Array.isArray(value)) {
    if (typeof value[0] === 'number') {
      // Handle 2-value arrays as min/max ranges
      if (value.length === 2) {
        const isRangeField = 
          key.includes('depth') || 
          key.includes('stdev') || 
          key.includes('bandwidth') || 
          key.includes('ratio') || 
          key.includes('column_height')
        
        if (isRangeField) {
          return (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Min</label>
                <input 
                  type="number" 
                  step={paramDef.step || (key.includes('ratio') || key.includes('bandwidth') ? 0.1 : 1)}
                  value={value[0]} 
                  onChange={(e) => onChange(key, [+e.target.value, value[1]])} 
                  className="w-full border rounded px-2 py-1.5 text-sm" 
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Max</label>
                <input 
                  type="number" 
                  step={paramDef.step || (key.includes('ratio') || key.includes('bandwidth') ? 0.1 : 1)}
                  value={value[1]} 
                  onChange={(e) => onChange(key, [value[0], +e.target.value])} 
                  className="w-full border rounded px-2 py-1.5 text-sm" 
                />
              </div>
            </div>
          )
        }
      }
      
      // Handle 3-value arrays (incident_angles = near/mid/far, snr = left/mode/right)
      if (value.length === 3) {
        if (key === 'incident_angles') {
          return (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Near</label>
                <input 
                  type="number" 
                  step={1}
                  value={value[0]} 
                  onChange={(e) => onChange(key, [+e.target.value, value[1], value[2]])} 
                  className="w-full border rounded px-2 py-1.5 text-sm" 
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Mid</label>
                <input 
                  type="number" 
                  step={1}
                  value={value[1]} 
                  onChange={(e) => onChange(key, [value[0], +e.target.value, value[2]])} 
                  className="w-full border rounded px-2 py-1.5 text-sm" 
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Far</label>
                <input 
                  type="number" 
                  step={1}
                  value={value[2]} 
                  onChange={(e) => onChange(key, [value[0], value[1], +e.target.value])} 
                  className="w-full border rounded px-2 py-1.5 text-sm" 
                />
              </div>
            </div>
          )
        }
        if (key === 'signal_to_noise_ratio_db') {
          return (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Left</label>
                <input 
                  type="number" 
                  step={0.1}
                  value={value[0]} 
                  onChange={(e) => onChange(key, [+e.target.value, value[1], value[2]])} 
                  className="w-full border rounded px-2 py-1.5 text-sm" 
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Mode</label>
                <input 
                  type="number" 
                  step={0.1}
                  value={value[1]} 
                  onChange={(e) => onChange(key, [value[0], +e.target.value, value[2]])} 
                  className="w-full border rounded px-2 py-1.5 text-sm" 
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Right</label>
                <input 
                  type="number" 
                  step={0.1}
                  value={value[2]} 
                  onChange={(e) => onChange(key, [value[0], value[1], +e.target.value])} 
                  className="w-full border rounded px-2 py-1.5 text-sm" 
                />
              </div>
            </div>
          )
        }
      }
      
      // Handle cube_shape (X, Y, Z dimensions)
      if (key === 'cube_shape') {
        return (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">X</label>
              <input 
                type="number" 
                step={1}
                value={value[0]} 
                onChange={(e) => onChange(key, [+e.target.value, value[1], value[2]])} 
                className="w-full border rounded px-2 py-1.5 text-sm" 
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Y</label>
              <input 
                type="number" 
                step={1}
                value={value[1]} 
                onChange={(e) => onChange(key, [value[0], +e.target.value, value[2]])} 
                className="w-full border rounded px-2 py-1.5 text-sm" 
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Z</label>
              <input 
                type="number" 
                step={1}
                value={value[2]} 
                onChange={(e) => onChange(key, [value[0], value[1], +e.target.value])} 
                className="w-full border rounded px-2 py-1.5 text-sm" 
              />
            </div>
          </div>
        )
      }
      return (
        <input
          type="text"
          value={value.join(', ')}
          onChange={(e) => {
            const arr = e.target.value.split(',').map(x => parseFloat(x.trim()) || 0)
            onChange(key, arr)
          }}
          className="w-full border rounded px-2 py-1.5 text-sm"
          placeholder="Comma-separated numbers"
        />
      )
    }
    return (
      <input
        type="text"
        value={value.join(', ')}
        onChange={(e) => onChange(key, e.target.value.split(',').map(x => x.trim()))}
        className="w-full border rounded px-2 py-1.5 text-sm"
        placeholder="Comma-separated values"
      />
    )
  }
  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center cursor-pointer">
        <input 
          type="checkbox" 
          checked={value} 
          onChange={(e) => onChange(key, e.target.checked)} 
          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <span className="ml-2 text-sm text-muted-foreground">
          {value ? 'Enabled' : 'Disabled'}
        </span>
      </label>
    )
  }
  if (typeof value === 'object' && value !== null) {
    return (
      <div className="space-y-2 bg-muted/30 p-3 rounded-md">
        {Object.entries(value as Record<string, number>).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-sm w-20 capitalize">{k}:</span>
            <input 
              type="number" 
              step="0.01" 
              value={v} 
              onChange={(e) => onChange(`${key}.${k}`, +e.target.value)} 
              className="flex-1 border rounded px-2 py-1 text-sm" 
            />
          </div>
        ))}
      </div>
    )
  }
  return (
    <input 
      type="text" 
      value={String(value)} 
      onChange={(e) => onChange(key, isNaN(+e.target.value) ? e.target.value : +e.target.value)} 
      className="w-full border rounded px-2 py-1.5 text-sm" 
    />
  )
}

export default function Configs() {
  const [configs, setConfigs] = useState<ConfigSummary[]>([])
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null)
  const [configData, setConfigData] = useState<ModelConfig | null>(null)
  const [configName, setConfigName] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    model: true,
    layers: true,
    seismic: false,
    faults: false,
    closures: false,
    features: false,
    output: false,
  })

  useEffect(() => { loadConfigs() }, [])

  async function loadConfigs() {
    try {
      const data = await getConfigs()
      setConfigs(data)
    } catch (error) {
      console.error('Failed to load configs:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(name: string) {
    try {
      const config = await getConfig(name)
      setConfigData(config)
      setSelectedConfig(name)
      setConfigName(name)
      setEditing(false)
    } catch (error) {
      toast.error('Failed to load config')
    }
  }

  async function handleNew() {
    try {
      const config = await getDefaultConfig()
      setConfigData(config)
      setSelectedConfig(null)
      setConfigName('')
      setEditing(true)
    } catch (error) {
      toast.error('Failed to create new config')
    }
  }

  async function handleSave() {
    if (!configName.trim()) {
      toast.error('Please enter a config name')
      return
    }
    if (!configData) return
    try {
      await saveConfig(configName, configData)
      toast.success('Config saved')
      loadConfigs()
      setSelectedConfig(configName)
      setEditing(false)
    } catch (error) {
      toast.error('Failed to save config')
    }
  }

  async function handleDelete(name: string) {
    if (!confirm('Are you sure you want to delete this config?')) return
    try {
      await deleteConfig(name)
      toast.success('Config deleted')
      if (selectedConfig === name) {
        setSelectedConfig(null)
        setConfigData(null)
      }
      loadConfigs()
    } catch (error) {
      toast.error('Failed to delete config')
    }
  }

  function handleFieldChange(key: string, value: unknown) {
    if (!configData) return
    const newData = { ...configData }
    const keys = key.split('.')
    let obj: Record<string, unknown> = newData
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]] as Record<string, unknown>
    }
    obj[keys[keys.length - 1]] = value
    setConfigData(newData)
  }

  const handleExport = () => {
    if (!configData) return
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${configName || 'config'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        // Handle both formats:
        // 1. Direct config: { "project": "example", ... }
        // 2. Wrapped config: { "name": "example", "config": {...}, "created_at": "...", "updated_at": "..." }
        if (data.config) {
          // Wrapped format - extract the config
          setConfigData(data.config)
        } else {
          // Direct format - use as-is
          setConfigData(data)
        }
        setEditing(true)
        toast.success('Config imported')
      } catch {
        toast.error('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Configuration Editor</h2>
          <p className="text-sm text-muted-foreground mt-1">Create and manage model configuration files</p>
        </div>
        <div className="flex gap-2">
          <label className="inline-flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-muted">
            <Upload className="w-4 h-4" />
            Import
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={handleNew} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90">
            <Plus className="w-4 h-4" />
            New Config
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Config List */}
        <div className="bg-white rounded-lg border p-4 h-fit">
          <h3 className="font-semibold mb-4">Saved Configurations</h3>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : configs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No saved configs</p>
          ) : (
            <div className="space-y-1">
              {configs.map((config) => (
                <div key={config.name} className="flex items-center justify-between group">
                  <button 
                    onClick={() => handleSelect(config.name)} 
                    className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      selectedConfig === config.name 
                        ? 'bg-primary text-white' 
                        : 'hover:bg-muted'
                    }`}
                  >
                    {config.name}
                  </button>
                  <button 
                    onClick={() => handleDelete(config.name)} 
                    className="p-1 text-muted-foreground hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main Editor */}
        <div className="lg:col-span-3 bg-white rounded-lg border">
          {configData ? (
            <div className="p-6">
              {/* Config Name Input */}
              <div className="flex items-end gap-4 mb-6 pb-6 border-b">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Configuration Name</label>
                  <input
                    type="text"
                    value={configName}
                    onChange={(e) => { setConfigName(e.target.value); setEditing(true); }}
                    placeholder="my-config"
                    className="w-full border rounded px-3 py-2"
                    disabled={selectedConfig !== null && !editing}
                  />
                </div>
                <div className="flex gap-2">
                  {editing ? (
                    <>
                      <button 
                        onClick={handleSave} 
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
                      >
                        <Save className="w-4 h-4" />
                        Save
                      </button>
                      <button 
                        onClick={() => { 
                          if (selectedConfig) handleSelect(selectedConfig); 
                          else setEditing(false);
                        }} 
                        className="px-4 py-2 border rounded-md hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => setEditing(true)} 
                        className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={handleExport} 
                        className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted"
                      >
                        <Download className="w-4 h-4" />
                        Export
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Parameter Sections */}
              <div className="space-y-4">
                {configSections.map((section) => (
                  <div key={section.id} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="text-left">
                        <h4 className="font-medium">{section.name}</h4>
                        <p className="text-xs text-muted-foreground">{section.description}</p>
                      </div>
                      {expandedSections[section.id] ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                    
                    {expandedSections[section.id] && (
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {section.fields.map((field) => {
                          const paramDef = paramDefinitions[field]
                          return (
                            <div key={field} className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <label className="text-sm font-medium">{paramDef?.name || field}</label>
                                <div className="group relative">
                                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                                  <div className="absolute left-0 bottom-full mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                    {paramDef?.description || 'No description available'}
                                    <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900" />
                                  </div>
                                </div>
                              </div>
                              {renderField(field, (configData as Record<string, unknown>)[field], handleFieldChange, paramDef!)}
                              <p className="text-xs text-muted-foreground">
                                Default: {JSON.stringify(paramDef?.default)}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="mb-4">Select a config to view or create a new one</p>
              <button 
                onClick={handleNew}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" />
                Create New Config
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
