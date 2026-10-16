import { useEffect, useState } from 'react'
import { Save, Download, Upload, Info } from 'lucide-react'
import { toast } from 'sonner'
import { getFaults, saveFaults, FaultConfig, defaultFaultConfig } from '@/lib/api'

const FAULT_STYLES = [
  {
    name: 'random',
    description: 'Completely random fault placement and orientation',
    icon: '🎲',
  },
  {
    name: 'self_branching',
    description: 'A main fault that branches into smaller faults',
    icon: '🌿',
  },
  {
    name: 'stair_case',
    description: 'Multiple parallel faults creating a stair-step pattern',
    icon: '🪜',
  },
  {
    name: 'relay_ramp',
    description: 'Diagonal faults with overlapping relay ramps between them',
    icon: '📐',
  },
  {
    name: 'horst_graben',
    description: 'Alternating raised (horst) and depressed (graben) blocks',
    icon: '🏔️',
  },
]

const NOISE_TYPES = [
  {
    name: 'random',
    description: 'No coherent noise - clean seismic data',
    icon: '🔇',
  },
  {
    name: 'random_coherent_smiles',
    description: 'Coherent noise with upward-curving (smile) patterns',
    icon: '🙂',
  },
  {
    name: 'random_coherent_frowns',
    description: 'Coherent noise with downward-curving (frown) patterns',
    icon: '🙁',
  },
]

interface FaultStyleCardProps {
  name: string
  description: string
  icon: string
  selected: boolean
  onClick: () => void
}

function FaultStyleCard({ name, description, icon, selected, onClick }: FaultStyleCardProps) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-all ${
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="font-medium text-sm capitalize">{name.replace('_', ' ')}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
    </button>
  )
}

export default function Faults() {
  const [configName, setConfigName] = useState('default')
  const [config, setConfig] = useState<FaultConfig>(defaultFaultConfig)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadConfig()
  }, [configName])

  async function loadConfig() {
    setLoading(true)
    try {
      const data = await getFaults(configName)
      setConfig(data)
    } catch (error) {
      console.error('Failed to load fault config:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    try {
      await saveFaults(configName, { ...config, name: configName })
      toast.success('Fault config saved')
    } catch (error) {
      toast.error('Failed to save config')
    }
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `faults_${configName}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        setConfig(data)
        toast.success('Config imported')
      } catch {
        toast.error('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  function toggleFaultMode(mode: string) {
    const modes = config.preferred_fault_modes || []
    if (modes.includes(mode)) {
      setConfig({ ...config, preferred_fault_modes: modes.filter(m => m !== mode) })
    } else {
      setConfig({ ...config, preferred_fault_modes: [...modes, mode] })
    }
  }

  function toggleNoiseType(noise: string) {
    const types = config.preferred_noise_types || []
    if (types.includes(noise)) {
      setConfig({ ...config, preferred_noise_types: types.filter(n => n !== noise) })
    } else {
      setConfig({ ...config, preferred_noise_types: [...types, noise] })
    }
  }

  function getComputedFaultThrow() {
    const low = 5.0 * config.infill_factor
    const high = 35.0 * config.infill_factor
    return { low, high }
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  const throwRange = getComputedFaultThrow()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Fault Configuration</h2>
        <div className="flex gap-2">
          <label className="inline-flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-muted">
            <Upload className="w-4 h-4" />
            Import
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={handleExport} className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Config Name</label>
            <input
              type="text"
              value={configName}
              onChange={(e) => setConfigName(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <button onClick={handleSave} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 mt-6">
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>

        <div className="mb-6 p-4 bg-amber-50 rounded-lg text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">How Faults Work in SynToSeis</p>
              <p className="mt-1">
                Faults are generated randomly based on the min/max fault count. The fault style (random, self-branching, stair-case, etc.) 
                and coherent noise type are internally chosen at runtime unless you specify preferences below.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div>
            <label className="block text-sm font-medium mb-1">Minimum Faults</label>
            <input
              type="number"
              min={0}
              max={20}
              value={config.min_number_faults}
              onChange={(e) => setConfig({ ...config, min_number_faults: parseInt(e.target.value) || 0 })}
              className="w-full border rounded px-3 py-2"
            />
            <p className="text-xs text-muted-foreground mt-1">Minimum number of faults to generate</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Maximum Faults</label>
            <input
              type="number"
              min={0}
              max={20}
              value={config.max_number_faults}
              onChange={(e) => setConfig({ ...config, max_number_faults: parseInt(e.target.value) || 0 })}
              className="w-full border rounded px-3 py-2"
            />
            <p className="text-xs text-muted-foreground mt-1">Maximum number of faults to generate</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Infill Factor</label>
            <input
              type="number"
              min={1}
              max={20}
              value={config.infill_factor}
              onChange={(e) => setConfig({ ...config, infill_factor: parseInt(e.target.value) || 1 })}
              className="w-full border rounded px-3 py-2"
            />
            <p className="text-xs text-muted-foreground mt-1">Affects fault throw calculation</p>
          </div>
        </div>

        <div className="mb-8 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-3">Computed Fault Throw Range</h4>
          <p className="text-sm text-muted-foreground">
            Fault throw is computed internally as: low = 5 × infill_factor, high = 35 × infill_factor
          </p>
          <div className="mt-2 flex gap-4">
            <div className="bg-white px-3 py-2 rounded border">
              <span className="text-xs text-muted-foreground">Low: </span>
              <span className="font-mono font-medium">{throwRange.low.toFixed(0)} samples</span>
            </div>
            <div className="bg-white px-3 py-2 rounded border">
              <span className="text-xs text-muted-foreground">High: </span>
              <span className="font-mono font-medium">{throwRange.high.toFixed(0)} samples</span>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h4 className="font-medium mb-3">Preferred Fault Styles</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Select which fault styles to prefer. Leave empty for completely random selection.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {FAULT_STYLES.map((style) => (
              <FaultStyleCard
                key={style.name}
                name={style.name}
                description={style.description}
                icon={style.icon}
                selected={config.preferred_fault_modes?.includes(style.name) || false}
                onClick={() => toggleFaultMode(style.name)}
              />
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-3">Preferred Coherent Noise Types</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Select which coherent noise types to prefer. Leave empty for random selection.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {NOISE_TYPES.map((noise) => (
              <FaultStyleCard
                key={noise.name}
                name={noise.name}
                description={noise.description}
                icon={noise.icon}
                selected={config.preferred_noise_types?.includes(noise.name) || false}
                onClick={() => toggleNoiseType(noise.name)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-semibold mb-4">Fault Style Reference</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FAULT_STYLES.map((style) => (
            <div key={style.name} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{style.icon}</span>
                <span className="font-medium capitalize">{style.name.replace('_', ' ')}</span>
              </div>
              <p className="text-sm text-muted-foreground">{style.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
