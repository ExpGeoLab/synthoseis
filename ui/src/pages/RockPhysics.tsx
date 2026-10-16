import { useEffect, useState } from 'react'
import { Save, Download, Upload, Info, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getRockPhysics, saveRockPhysics, deleteRockPhysics, RockPhysicsConfig, PolynomialCoeffs, RockTypeProperties, defaultRockPhysics } from '@/lib/api'

interface CoeffsProps {
  label: string
  value: PolynomialCoeffs
  onChange: (coeffs: PolynomialCoeffs) => void
  description: string
}

function CoefficientInputs({ label, value, onChange, description }: CoeffsProps) {
  return (
    <div className="bg-muted/30 rounded-md p-3">
      <p className="text-sm font-medium mb-1">{label}</p>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div>
          <label className="text-muted-foreground block mb-1">a (z³)</label>
          <input
            type="number"
            step="1e-12"
            value={value.a}
            onChange={(e) => onChange({ ...value, a: parseFloat(e.target.value) || 0 })}
            className="w-full border rounded px-2 py-1 font-mono"
            placeholder="0"
          />
        </div>
        <div>
          <label className="text-muted-foreground block mb-1">b (z²)</label>
          <input
            type="number"
            step="1e-8"
            value={value.b}
            onChange={(e) => onChange({ ...value, b: parseFloat(e.target.value) || 0 })}
            className="w-full border rounded px-2 py-1 font-mono"
            placeholder="0"
          />
        </div>
        <div>
          <label className="text-muted-foreground block mb-1">c (z)</label>
          <input
            type="number"
            step="0.001"
            value={value.c}
            onChange={(e) => onChange({ ...value, c: parseFloat(e.target.value) || 0 })}
            className="w-full border rounded px-2 py-1 font-mono"
            placeholder="0"
          />
        </div>
        <div>
          <label className="text-muted-foreground block mb-1">d (const)</label>
          <input
            type="number"
            step="0.1"
            value={value.d}
            onChange={(e) => onChange({ ...value, d: parseFloat(e.target.value) || 0 })}
            className="w-full border rounded px-2 py-1 font-mono"
            placeholder="0"
          />
        </div>
      </div>
    </div>
  )
}

interface RockTypeProps {
  name: string
  color: string
  properties: RockTypeProperties
  onChange: (props: RockTypeProperties) => void
  description: string
  typicalRange: string
}

function RockTypeEditor({ name, color, properties, onChange, description, typicalRange }: RockTypeProps) {
  const [expanded, setExpanded] = useState(true)
  
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <button 
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 font-semibold hover:opacity-80"
          style={{ color }}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {name}
        </button>
        <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">{typicalRange}</span>
      </div>
      
      {expanded && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{description}</p>
          
          <CoefficientInputs
            label="Vp (P-wave velocity)"
            description="Primary wave velocity - how fast compressional waves travel through the rock. Key for seismic imaging and depth conversion."
            value={properties.vp}
            onChange={(vp) => onChange({ ...properties, vp })}
          />
          
          <CoefficientInputs
            label="Vs (S-wave velocity)"
            description="Shear wave velocity - how fast shear waves travel. Used for Poisson's ratio and fluid detection (Vs doesn't propagate through fluids)."
            value={properties.vs}
            onChange={(vs) => onChange({ ...properties, vs })}
          />
          
          <CoefficientInputs
            label="Rho (Bulk density)"
            description="Rock bulk density in g/cm³. Affects seismic amplitude and is used for acoustic impedance calculations."
            value={properties.rho}
            onChange={(rho) => onChange({ ...properties, rho })}
          />
        </div>
      )}
    </div>
  )
}

function CoeffsInputs({ label, value, onChange, description }: CoeffsProps) {
  return (
    <div>
      <CoefficientInputs label={label} value={value} onChange={onChange} description={description} />
    </div>
  )
}

export default function RockPhysics() {
  const [configName, setConfigName] = useState('default')
  const [config, setConfig] = useState<RockPhysicsConfig>(defaultRockPhysics)
  const [savedConfigs, setSavedConfigs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    loadConfigs()
  }, [])

  async function loadConfigs() {
    setLoading(true)
    try {
      const data = await getRockPhysics(configName)
      setConfig(data)
      setSavedConfigs(['default'])
    } catch (error) {
      console.error('Failed to load rock physics config:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    try {
      await saveRockPhysics(configName, { ...config, name: configName })
      toast.success('Rock physics config saved')
      if (!savedConfigs.includes(configName)) {
        setSavedConfigs([...savedConfigs, configName])
      }
    } catch (error) {
      toast.error('Failed to save config')
    }
  }

  async function handleDelete() {
    if (configName === 'default') {
      toast.error('Cannot delete default config')
      return
    }
    if (!confirm('Are you sure you want to delete this config?')) return
    try {
      await deleteRockPhysics(configName)
      toast.success('Config deleted')
      setSavedConfigs(savedConfigs.filter(c => c !== configName))
      setConfigName('default')
      loadConfigs()
    } catch (error) {
      toast.error('Failed to delete config')
    }
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rockphysics_${configName}.json`
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

  function updateRockType(rockType: 'shale' | 'brine_sand' | 'oil_sand' | 'gas_sand', props: RockTypeProperties) {
    setConfig({ ...config, [rockType]: props })
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Rock Physics Model</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowHelp(!showHelp)}
            className={`inline-flex items-center gap-2 px-4 py-2 border rounded-md ${showHelp ? 'bg-blue-50 border-blue-300' : 'hover:bg-muted'}`}
          >
            <Info className="w-4 h-4" />
            {showHelp ? 'Hide Help' : 'Show Help'}
          </button>
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

      {showHelp && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
          <div>
            <h3 className="font-semibold text-blue-900">Rock Physics in SynToSeis</h3>
            <p className="text-sm text-blue-800 mt-1">
              Rock physics models define how seismic velocities and densities vary with depth for different lithologies.
              These properties determine the seismic reflection response and are essential for generating realistic synthetic seismic data.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/60 p-3 rounded">
              <h4 className="font-medium text-blue-900">Vp - P-wave Velocity</h4>
              <p className="text-xs text-blue-800 mt-1">
                Compressional wave velocity. The primary seismic wave used in reflection seismology. 
                Typical values: 1500-6000 m/s. Sensitive to porosity, fluid content, and lithology.
              </p>
            </div>
            <div className="bg-white/60 p-3 rounded">
              <h4 className="font-medium text-blue-900">Vs - S-wave Velocity</h4>
              <p className="text-xs text-blue-800 mt-1">
                Shear wave velocity. Does not propagate through fluids (oil, gas, water).
                Used for fluid detection and calculating elastic properties. Typical: 500-3500 m/s.
              </p>
            </div>
            <div className="bg-white/60 p-3 rounded">
              <h4 className="font-medium text-blue-900">Rho - Bulk Density</h4>
              <p className="text-xs text-blue-800 mt-1">
                Rock bulk density including pore fluids. Typical ranges: 1.9-2.8 g/cm³.
                Shales are denser than sands; gas sands have lowest density.
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-blue-900">Polynomial Coefficients Explained</h4>
            <p className="text-xs text-blue-800 mt-1">
              The formula <code className="bg-white px-1 rounded">value = a·z³ + b·z² + c·z + d</code> defines how each property changes with depth (z in meters).
              The constant term (d) is typically the surface or shallow value. The linear term (c) represents the primary velocity increase with depth due to compaction.
              Higher-order terms (a, b) capture non-linear compaction effects at great depths.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/60 p-3 rounded">
              <h4 className="font-medium text-blue-900">Typical Shale Trends</h4>
              <p className="text-xs text-blue-800 mt-1">
                Vp increases with depth due to compaction. Vs has similar trend but lower values. 
                Density increases from ~1.9 g/cm³ at surface to ~2.6-2.7 g/cm³ at depth.
              </p>
            </div>
            <div className="bg-white/60 p-3 rounded">
              <h4 className="font-medium text-blue-900">Fluid Effects on Sand</h4>
              <p className="text-xs text-blue-800 mt-1">
                <strong>Brine sand:</strong> Highest density, moderate velocities. <br/>
                <strong>Oil sand:</strong> Lower density than brine, similar velocities. <br/>
                <strong>Gas sand:</strong> Lowest density, significantly reduced Vp and Vs compared to brine.
              </p>
            </div>
          </div>
        </div>
      )}

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
          <div className="flex gap-2 pt-6">
            <button onClick={handleSave} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90">
              <Save className="w-4 h-4" />
              Save
            </button>
            <button onClick={handleDelete} className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mb-4 p-4 bg-amber-50 rounded-lg text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Velocity-Depth Relationship: value = a·z³ + b·z² + c·z + d</p>
              <p className="mt-1">
                Configure polynomial coefficients for Vp (P-wave), Vs (S-wave), and Rho (density) as functions of depth (z in meters) for each rock type.
                The coefficients determine how seismic velocities and density change with burial depth due to compaction.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RockTypeEditor
            name="Shale"
            color="#8B4513"
            typicalRange="Vp: 1500-3500 m/s"
            description="Shales are the most common sedimentary rocks. They compact more rapidly with depth than sands, showing strong velocity-depth trends. Shales form the background lithology and seal rocks for hydrocarbon traps."
            properties={config.shale}
            onChange={(props) => updateRockType('shale', props)}
          />
          <RockTypeEditor
            name="Brine Sand"
            color="#1E90FF"
            typicalRange="Vp: 2000-4000 m/s"
            description="Sandstone saturated with brine (salt water). Brine-filled sands have the highest density among fluid types. Velocities are higher than oil or gas sands due to water's relatively high bulk modulus."
            properties={config.brine_sand}
            onChange={(props) => updateRockType('brine_sand', props)}
          />
          <RockTypeEditor
            name="Oil Sand"
            color="#228B22"
            typicalRange="Vp: 1800-3800 m/s"
            description="Sandstone saturated with oil. Oil has lower bulk modulus than water, causing reduced velocities compared to brine sands. The density contrast creates seismic reflections at oil-water contacts."
            properties={config.oil_sand}
            onChange={(props) => updateRockType('oil_sand', props)}
          />
          <RockTypeEditor
            name="Gas Sand"
            color="#FF6347"
            typicalRange="Vp: 1500-3500 m/s"
            description="Sandstone saturated with gas. Gas has very low bulk modulus, causing the largest velocity and density reduction. Gas sands produce the strongest amplitude anomalies (bright spots) on seismic data."
            properties={config.gas_sand}
            onChange={(props) => updateRockType('gas_sand', props)}
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-semibold mb-4">Velocity-Depth Trend Reference</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Rock Type</th>
                <th className="text-left p-2">Vp Range (m/s)</th>
                <th className="text-left p-2">Vs Range (m/s)</th>
                <th className="text-left p-2">Density (g/cm³)</th>
                <th className="text-left p-2">Key Characteristics</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2 font-medium" style={{ color: '#8B4513' }}>Shale</td>
                <td className="p-2">1500 - 3500</td>
                <td className="p-2">500 - 2000</td>
                <td className="p-2">1.9 - 2.7</td>
                <td className="p-2 text-muted-foreground">Compacts rapidly, forms seals</td>
              </tr>
              <tr>
                <td className="p-2 font-medium" style={{ color: '#1E90FF' }}>Brine Sand</td>
                <td className="p-2">2000 - 4000</td>
                <td className="p-2">800 - 2500</td>
                <td className="p-2">2.0 - 2.4</td>
                <td className="p-2 text-muted-foreground">Highest velocity fluid case</td>
              </tr>
              <tr>
                <td className="p-2 font-medium" style={{ color: '#228B22' }}>Oil Sand</td>
                <td className="p-2">1800 - 3800</td>
                <td className="p-2">700 - 2200</td>
                <td className="p-2">1.9 - 2.3</td>
                <td className="p-2 text-muted-foreground">Moderate velocity reduction</td>
              </tr>
              <tr>
                <td className="p-2 font-medium" style={{ color: '#FF6347' }}>Gas Sand</td>
                <td className="p-2">1500 - 3500</td>
                <td className="p-2">500 - 1800</td>
                <td className="p-2">1.6 - 2.1</td>
                <td className="p-2 text-muted-foreground">Lowest velocity, bright spots</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
