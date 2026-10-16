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
    description: 'Selects the rock-physics model that turns lithology into velocity and density (must match a module in rockphysics/, e.g. "example"). A different project changes the seismic amplitudes and how strongly sand and shale contrast.'
  },
  project_folder: {
    name: 'Project Folder',
    type: 'string',
    default: '/scratch/synthoseis_example',
    description: 'Where each run writes its output: seismic volumes, labels, QC images and logs. Every run gets its own subfolder, so earlier results are not overwritten.'
  },
  work_folder: {
    name: 'Work Folder',
    type: 'string',
    default: '/scratch',
    description: 'Scratch space for intermediate files, deleted when a run finishes. It needs enough free disk for the cube you choose, but it does not change the results.'
  },
  cube_shape: {
    name: 'Cube Shape',
    type: 'number_array',
    default: [300, 300, 1250],
    description: 'Output size as [inlines, crosslines, samples]. A bigger cube shows more geology (more faults, wider channels and fans) but memory and run time grow roughly with the number of voxels. Use a small cube such as 100 x 100 for quick tests.'
  },
  incident_angles: {
    name: 'Incident Angles',
    type: 'number_array',
    default: [7, 15, 24],
    description: 'Angles (degrees) of the near, mid and far angle-stack volumes. Wider angles carry more AVO effect, so hydrocarbon sands look more different between the near and far stacks.'
  },
  digi: {
    name: 'Digitization',
    type: 'number',
    default: 4,
    description: 'Vertical sample interval of the output seismic in milliseconds. Smaller values give finer vertical detail and more samples for the same time span; the time covered is samples x interval, so changing it also changes how much geology fits in the cube.'
  },
  infill_factor: {
    name: 'Infill Factor',
    type: 'number',
    default: 10,
    description: 'Vertical oversampling used while the layers are built, before they are reduced to the output sampling. Higher values resolve thin layers and gently dipping surfaces better but multiply memory use. It does not change the output sampling.'
  },
  initial_layer_stdev: {
    name: 'Initial Layer Stdev',
    type: 'number_array',
    default: [7.0, 25.0],
    description: 'Roughness of the starting surface at the base of the model, as a [min, max] range in samples. Higher values give a more undulating, structurally varied model (more potential closures); lower values give flatter layering.'
  },
  thickness_min: {
    name: 'Minimum Layer Thickness',
    type: 'number',
    default: 2,
    description: 'Thinnest layer that can be generated, in samples. Raising it removes the finest layering, so there are fewer closely spaced reflections.'
  },
  thickness_max: {
    name: 'Maximum Layer Thickness',
    type: 'number',
    default: 12,
    description: 'Thickest layer that can be generated, in samples. Lowering it makes layering more uniform and finer; raising it allows a few thick, transparent intervals between reflections.'
  },
  seabed_min_depth: {
    name: 'Seabed Minimum Depth',
    type: 'number_array',
    default: [20, 50],
    description: 'Range for how deep the seabed sits below the top of the cube, in samples. Larger values leave a thicker water column at the top and less sediment in the cube.'
  },
  signal_to_noise_ratio_db: {
    name: 'Signal to Noise Ratio (dB)',
    type: 'number_array',
    default: [7.5, 12.5, 17.5],
    description: '[low, mode, high] of a triangular distribution in dB; one value is drawn per model. Lower values give noisy seismic that is harder to interpret, higher values give clean data. Mixing values makes a training set more robust.'
  },
  bandwidth_low: {
    name: 'Bandwidth Low',
    type: 'number_array',
    default: [3.0, 6.0],
    description: 'Low-cut frequency range in Hz; one value is drawn per model. Raising it removes low-frequency content, giving a more oscillatory wavelet with less smooth trend; lowering it keeps broader, smoother events.'
  },
  bandwidth_high: {
    name: 'Bandwidth High',
    type: 'number_array',
    default: [20.0, 35.0],
    description: 'High-cut frequency range in Hz; one value is drawn per model. Higher values give sharper, higher-resolution seismic that separates thinner beds; lower values blur thin layers together.'
  },
  bandwidth_ord: {
    name: 'Bandwidth Order',
    type: 'number',
    default: 4,
    description: 'Order (steepness) of the band-pass filter. Higher values give sharper cut-offs but more ringing around strong events; lower values give gentler roll-off.'
  },
  dip_factor_max: {
    name: 'Dip Factor Maximum',
    type: 'number',
    default: 2,
    description: 'Scales how steeply layers tilt during tilting (onlap) episodes. Larger values give steeper dips and more onlap terminations, which means more stratigraphic traps and more structural complexity.'
  },
  min_number_faults: {
    name: 'Minimum Number of Faults',
    type: 'number',
    default: 1,
    description: 'Lower end of the number of faults drawn per model. Each fault offsets the layers and can form fault-bounded closures; raising it makes every model more heavily faulted.'
  },
  max_number_faults: {
    name: 'Maximum Number of Faults',
    type: 'number',
    default: 6,
    description: 'Upper end of the number of faults drawn per model. Raising it allows more heavily faulted models; keep it equal to the minimum for a fixed number of faults.'
  },
  pad_samples: {
    name: 'Padding Samples',
    type: 'number',
    default: 10,
    description: 'Extra samples added above and below the cube while modelling and then removed. More padding avoids edge artifacts at the top and bottom, especially with large fault throws. It does not change the output size.'
  },
  max_column_height: {
    name: 'Maximum Column Height',
    type: 'number_array',
    default: [150.0, 150.0],
    description: 'Upper limit on how tall a hydrocarbon column in a closure can be. Lower values give partly filled traps; higher values let closures fill to their spill point, giving larger hydrocarbon volumes and stronger flat-spot responses.'
  },
  closure_types: {
    name: 'Closure Types',
    type: 'string_array',
    default: ['simple', 'faulted', 'onlap'],
    description: 'Which trap types may contain hydrocarbons: "simple" (four-way dip closure), "faulted" (fault-dependent) and "onlap" (stratigraphic pinch-out). Removing a type removes those closures and their hydrocarbon response from the labels and the seismic.'
  },
  min_closure_voxels_simple: {
    name: 'Min Simple Closure Voxels',
    type: 'number',
    default: 500,
    description: 'Simple closures smaller than this many voxels are filled with brine instead of oil or gas, so they have no hydrocarbon response. Raising it leaves fewer, larger accumulations; lowering it keeps small ones, which are harder to see.'
  },
  min_closure_voxels_faulted: {
    name: 'Min Faulted Closure Voxels',
    type: 'number',
    default: 2500,
    description: 'Faulted closures smaller than this many voxels are filled with brine. The default is higher than for simple closures because fault-bounded traps are more complex.'
  },
  min_closure_voxels_onlap: {
    name: 'Min Onlap Closure Voxels',
    type: 'number',
    default: 500,
    description: 'Onlap (stratigraphic) closures smaller than this many voxels are filled with brine. Raising it leaves fewer pinch-out accumulations in the labels.'
  },
  sand_layer_thickness: {
    name: 'Sand Layer Thickness',
    type: 'number',
    default: 2,
    description: 'Typical number of consecutive sand layers when sand occurs. Higher values stack sand together into thick packages with thick shale between them; lower values alternate sand and shale quickly, giving more reflections.'
  },
  sand_layer_fraction: {
    name: 'Sand Layer Fraction',
    type: 'object',
    default: { min: 0.05, max: 0.25 },
    description: 'Fraction of layers that are sand, drawn between min and max per model. Higher values give sand-rich models with more reservoir and more potential closures; lower values give shale-dominated models.'
  },
  extra_qc_plots: {
    name: 'Extra QC Plots',
    type: 'boolean',
    default: true,
    description: 'Saves extra PNG diagnostics in the run folder, such as lithology, fan and channel plots. They appear under QC Images on the run page. It slows a run a little and does not change the seismic.'
  },
  verbose: {
    name: 'Verbose',
    type: 'boolean',
    default: true,
    description: 'Writes more progress and diagnostic text to the log. It does not change the results.'
  },
  partial_voxels: {
    name: 'Partial Voxels',
    type: 'boolean',
    default: true,
    description: 'On: voxels that cross a layer boundary get a blended property, giving smoother, more realistic reflections on thin and dipping layers. Off: each voxel takes one layer\'s value, giving blockier boundaries but a faster run.'
  },
  variable_shale_ng: {
    name: 'Variable Shale Net-to-Gross',
    type: 'boolean',
    default: false,
    description: 'On: shale layers get a low, laterally varying net-to-gross, adding subtle amplitude variation inside shales. Off: shales are pure shale (net-to-gross 0), giving a cleaner sand-shale contrast.'
  },
  basin_floor_fans: {
    name: 'Basin Floor Fans',
    type: 'boolean',
    default: false,
    description: 'Inserts 1 to 3 fan-shaped sand bodies that thin to zero at their edges. They show as lobate amplitude anomalies on time slices and add pinch-out geometry and stratigraphic trap potential. Shapes are random; see the Features page for typical ones.'
  },
  include_channels: {
    name: 'Include Channels',
    type: 'boolean',
    default: false,
    description: 'Inserts meandering channel belts as sand bodies: sinuous point-bar anomalies on time slices, about 5 to 20 m thick. Each channel adds roughly 5 to 10 seconds to a run. Preview and tune them on the Features page.'
  },
  channel_count: {
    name: 'Channel Count',
    type: 'number_array',
    default: [1, 2],
    description: 'How many channel belts each model gets, drawn between min and max. More channels give more sinuous sand bodies at different depths, and each adds roughly 5 to 10 seconds. Only used when Include Channels is on.'
  },
  channel_width: {
    name: 'Channel Width (m)',
    type: 'number_array',
    default: [80, 250],
    description: 'Channel width in metres, drawn for each channel. Wider channels give broad belts with long, gentle bends; narrower channels give tighter meanders that stay visible on small cubes. Keep it above about two cell sizes so the channel is resolved.'
  },
  channel_thickness_scale: {
    name: 'Channel Thickness Scale',
    type: 'number',
    default: 1.0,
    step: 0.1,
    description: 'Multiplies the channel sand thickness. 1.0 gives point bars of about 5 to 20 m. Higher values make channels thicker, brighter and easier to see in the seismic; lower values make them thin and subtle, close to the limit of seismic resolution.'
  },
  channel_bin_size: {
    name: 'Channel Bin Size (m)',
    type: 'number',
    default: 25,
    step: 1,
    description: 'Real-world size of one cube cell in metres. Larger cells make a channel cover fewer cells, so the same cube spans more ground and bends look smaller; smaller cells enlarge channels so only a few bends fill the cube.'
  },
  include_salt: {
    name: 'Include Salt',
    type: 'boolean',
    default: true,
    description: 'Inserts a salt body that pushes up and drags the surrounding layers and appears as its own lithology in the labels. It adds structural complexity and salt-flank trap geometries.'
  },
  write_to_hdf: {
    name: 'Write to HDF',
    type: 'boolean',
    default: false,
    description: 'Also writes the QC and extra volumes to an HDF file. The files are large and only useful for external analysis; the main outputs are not affected.'
  },
  broadband_qc_volume: {
    name: 'Broadband QC Volume',
    type: 'boolean',
    default: false,
    description: 'Outputs an extra broadband (2 to 90 Hz) seismic volume alongside the normal band-limited ones. It shows what the model looks like at full resolution and adds one volume to the output.'
  },
  model_qc_volumes: {
    name: 'Model QC Volumes',
    type: 'boolean',
    default: true,
    description: 'Saves intermediate volumes (geologic age, fault planes, onlap segments and similar) to disk. They take extra space but let you inspect the model and use the labels.'
  },
  multiprocess_bp: {
    name: 'Multiprocess Bandpass',
    type: 'boolean',
    default: true,
    description: 'Runs the band-pass filtering of the seismic volumes in parallel. It is faster on multi-core machines and does not change the results.'
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
    id: 'channels',
    name: 'Channel Settings', 
    description: 'Fluvial channel belt parameters (used when Include Channels is on)',
    fields: ['channel_count', 'channel_width', 'channel_thickness_scale', 'channel_bin_size'] 
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
                                  <div className="absolute left-0 bottom-full mb-2 w-80 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                    {paramDef?.description || 'No description available'}
                                    <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900" />
                                  </div>
                                </div>
                              </div>
                              {renderField(field, (configData as unknown as Record<string, unknown>)[field] ?? paramDef?.default, handleFieldChange, paramDef!)}
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
