import { useEffect, useRef, useState } from 'react'
import { HelpCircle, Mountain, Play, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { previewFeature, FeatureKind, FeaturePreview as Preview, FeaturePreviewRequest } from '@/lib/api'

const featureInfo: Record<FeatureKind, { label: string; description: string }> = {
  channels: {
    label: 'Fluvial Channels',
    description:
      'Meandering channel belt (point-bar sand). Runs a meander simulation, so a preview takes a few seconds. In a full run this becomes a sinuous, bright sand body on time slices.',
  },
  fans: {
    label: 'Basin Floor Fans',
    description:
      'Turbidite fan thickness map. Fans are random; use the seed to repeat one. In a full run each fan is a lobate sand body that thins to zero at its edges.',
  },
  clinoforms: {
    label: 'Clinoforms',
    description:
      'Prograding shelf-slope package. Leave a field empty to randomise it. In a full run the dipping foresets produce the classic oblique reflections that downlap onto the basin floor.',
  },
}

// viridis-like colour stops
const stops: [number, number, number][] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
]

function colormap(t: number): [number, number, number] {
  const x = Math.min(Math.max(t, 0), 1) * (stops.length - 1)
  const i = Math.min(Math.floor(x), stops.length - 2)
  const f = x - i
  return [0, 1, 2].map((c) => Math.round(stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f)) as [number, number, number]
}

type NumField = { key: string; label: string; step?: number; help: string }

const gridHelp =
  'Number of cells along each side of the preview. Larger grids show more of the feature (more channel bends, a wider fan) but take longer; channels take a few seconds even at 100. Full runs use the cube shape from the config.'
const seedHelp =
  'Fixes the random draw so the same inputs give the same feature. Change it to see another realisation; leave it empty for a new random one each time.'

const channelFields: NumField[] = [
  {
    key: 'channel_thickness_scale',
    label: 'Thickness scale',
    step: 0.1,
    help: 'Multiplies the channel sand thickness. Higher values make the channel thicker, brighter and easier to see in the seismic; lower values make it thin and subtle, near the limit of seismic resolution.',
  },
  {
    key: 'channel_bin_size',
    label: 'Cell size (m)',
    step: 1,
    help: 'Real-world size of one cell. Larger cells make the channel cover fewer cells, so the grid spans more ground and bends look smaller; smaller cells enlarge it so only a few bends fill the grid.',
  },
]

const clinoformFields: NumField[] = [
  {
    key: 'n_clinoforms',
    label: 'Number of clinoforms',
    help: 'How many time-lines the package contains. More clinoforms give finer foreset layering and more reflections across the slope; fewer give a few bold, widely spaced surfaces.',
  },
  {
    key: 'azimuth',
    label: 'Progradation azimuth (deg)',
    help: 'Direction the shelf edge advances, measured in the grid. It rotates the whole package, so foresets dip toward this direction on the map and in the section line.',
  },
  {
    key: 'relief_m',
    label: 'Relief (m)',
    help: 'Height from topset to basin floor. Larger relief gives a taller, more prominent slope and a thicker package; smaller relief gives a subtle slope with thinner foresets.',
  },
  {
    key: 'foreset_angle_deg',
    label: 'Foreset angle (deg)',
    step: 0.1,
    help: 'Steepness of the slope. Steeper angles give a short, steep foreset with sharply dipping reflections; gentle angles stretch the foreset across a wide area so reflections dip only slightly.',
  },
  {
    key: 'step_m',
    label: 'Progradation per step (m)',
    help: 'How far the shelf edge advances between clinoforms. Larger steps space the foresets further apart (sparse, widely separated reflections); smaller steps pack them tightly together.',
  },
  {
    key: 'aggradation_m',
    label: 'Aggradation per step (m)',
    step: 0.1,
    help: 'How much the shelf rises with each step (the shelf-edge trajectory). Zero gives pure progradation with toplap at the shelf edge; positive values build thicker topsets and make the package aggradational; negative values drop the shelf edge (forced regression) and produce offlap.',
  },
]

const erosionFields: NumField[] = [
  {
    key: 'erosion_position',
    label: 'Erosion position (0 to 1)',
    step: 0.05,
    help: 'When in the package the erosion happens, as a fraction from oldest (0) to youngest (1). Earlier erosion cuts few clinoforms and leaves a large fill on top; later erosion truncates most of the package.',
  },
  {
    key: 'erosion_depth_m',
    label: 'Erosion depth (m)',
    help: 'How deep the surface cuts into the topset and upper foreset. Deeper erosion truncates more of the older clinoforms, giving more pronounced toplap truncation and a thicker onlapping fill above.',
  },
  {
    key: 'n_valleys',
    label: 'Incised valleys',
    help: 'Number of valleys cut below the erosion surface. Each valley runs down through the shelf edge and is filled by younger clinoforms, giving local thick fill and a curved erosion surface in the section.',
  },
  {
    key: 'stepdown_m',
    label: 'Step-down above erosion (m)',
    step: 0.5,
    help: 'How far each younger topset sits below the previous one in the wedge above the erosion surface. Larger values give a bolder staircase of horizontal topsets (offlap) starting on the erosion line; 0 stacks the topsets at one level; negative values step upward (back-stepping).',
  },
  {
    key: 'valley_depth_m',
    label: 'Valley depth (m)',
    help: 'Extra depth of the valleys below the general erosion surface. Deeper valleys give thicker local fill and a more irregular erosion surface.',
  },
]

const terminationInfo: Record<string, { label: string; color: string; help: string }> = {
  toplap: {
    label: 'Toplap',
    color: '#f59e0b',
    help: 'Dipping strata end up-dip against the overlying surface without being cut, because sediment bypassed the shelf. A line of toplaps marks the shelf edge and the top of a prograding package.',
  },
  offlap: {
    label: 'Offlap',
    color: '#9333ea',
    help: 'Toplaps that step basinward and downward from one layer to the next. This is the signature of a falling shelf edge (forced regression): each younger layer is deposited lower and further out, leaving the older topset exposed.',
  },
  downlap: {
    label: 'Downlap',
    color: '#16a34a',
    help: 'Dipping strata end down-dip against a lower surface, here where foresets reach the basin floor. Downlap surfaces mark the base of clinoforms and are often the strongest reflections in the package.',
  },
  onlap: {
    label: 'Onlap',
    color: '#2563eb',
    help: 'Strata thin and end against a lower surface that dips more steeply, typically younger layers filling a valley or depression. Onlap tells you the underlying surface already had relief when these layers were laid down.',
  },
  truncation: {
    label: 'Truncation',
    color: '#dc2626',
    help: 'Strata are cut off by the erosion surface above them. Unlike toplap, material has been removed, so the older layers stop abruptly against the unconformity.',
  },
}

function Help({ text }: { text: string }) {
  return (
    <div className="group relative inline-block">
      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
      <div className="absolute left-0 bottom-full mb-2 w-72 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        {text}
        <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900" />
      </div>
    </div>
  )
}

function Label({ text, help }: { text: string; help: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <label className="text-sm font-medium">{text}</label>
      <Help text={help} />
    </div>
  )
}

export default function FeaturePreview() {
  const [feature, setFeature] = useState<FeatureKind>('clinoforms')
  const [cubeSize, setCubeSize] = useState(100)
  const [seed, setSeed] = useState('')
  const [values, setValues] = useState<Record<string, string>>({ channel_thickness_scale: '1', channel_bin_size: '25' })
  const [erosion, setErosion] = useState<'random' | 'on' | 'off'>('random')
  const [countRange, setCountRange] = useState<[string, string]>(['1', '2'])
  const [widthRange, setWidthRange] = useState<[string, string]>(['80', '250'])
  const [data, setData] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const mapRef = useRef<HTMLCanvasElement>(null)
  const sectionRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    handleGenerate()
  }, [])

  useEffect(() => {
    if (data) {
      drawMap(mapRef.current, data)
      drawSection(sectionRef.current, data)
    }
  }, [data])

  const num = (v: string | undefined): number | null => (v === undefined || v.trim() === '' ? null : Number(v))

  async function handleGenerate() {
    setLoading(true)
    try {
      const req: FeaturePreviewRequest = { feature, cube_size: cubeSize, seed: num(seed) }
      if (feature === 'channels') {
        req.channel_count = countRange.map(Number)
        req.channel_width = widthRange.map(Number)
        req.channel_thickness_scale = num(values.channel_thickness_scale) ?? 1
        req.channel_bin_size = num(values.channel_bin_size) ?? 25
      }
      if (feature === 'clinoforms') {
        req.n_clinoforms = num(values.n_clinoforms)
        req.azimuth = num(values.azimuth)
        req.relief_m = num(values.relief_m)
        req.foreset_angle_deg = num(values.foreset_angle_deg)
        req.step_m = num(values.step_m)
        req.aggradation_m = num(values.aggradation_m)
        req.channel_bin_size = num(values.channel_bin_size) ?? 25
        req.erosion = erosion === 'random' ? null : erosion === 'on'
        req.erosion_position = num(values.erosion_position)
        req.erosion_depth_m = num(values.erosion_depth_m)
        req.n_valleys = num(values.n_valleys)
        req.valley_depth_m = num(values.valley_depth_m)
        req.stepdown_m = num(values.stepdown_m)
      }
      setData(await previewFeature(req))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate preview')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  function drawMap(canvas: HTMLCanvasElement | null, d: Preview) {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { nx, ny, thickness } = d
    const off = document.createElement('canvas')
    off.width = nx
    off.height = ny
    const offCtx = off.getContext('2d')!
    const img = offCtx.createImageData(nx, ny)
    const max = d.max_thickness_m || 1
    for (let x = 0; x < nx; x++) {
      for (let y = 0; y < ny; y++) {
        const [r, g, b] = colormap(thickness[x][y] / max)
        const p = (y * nx + x) * 4
        img.data[p] = r
        img.data[p + 1] = g
        img.data[p + 2] = b
        img.data[p + 3] = 255
      }
    }
    offCtx.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height)
    // section line
    const sx = canvas.width / nx
    const sy = canvas.height / ny
    const [x0, y0, x1, y1] = d.line
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(x0 * sx, y0 * sy)
    ctx.lineTo(x1 * sx, y1 * sy)
    ctx.stroke()
    ctx.setLineDash([])
  }

  function drawSection(canvas: HTMLCanvasElement | null, d: Preview) {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    const pad = { l: 50, r: 15, t: 15, b: 30 }
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)

    const xs = d.section.x_cells
    const erosionLine = d.section.erosion ?? null
    const all = [...d.section.horizons.flat(), ...(erosionLine ?? [])]
    let zMin = Math.min(...all)
    let zMax = Math.max(...all)
    if (zMax - zMin < 1) {
      zMin -= 1
      zMax += 1
    }
    const px = (x: number) => pad.l + ((x - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (w - pad.l - pad.r)
    const py = (z: number) => pad.t + ((z - zMin) / (zMax - zMin)) * (h - pad.t - pad.b)

    // axes
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.strokeRect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b)
    ctx.fillStyle = '#6b7280'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const z = zMin + ((zMax - zMin) * i) / 4
      ctx.fillText(z.toFixed(0), pad.l - 5, py(z) + 3)
    }
    ctx.textAlign = 'center'
    for (let i = 0; i <= 4; i++) {
      const x = xs[0] + ((xs[xs.length - 1] - xs[0]) * i) / 4
      ctx.fillText(x.toFixed(0), px(x), h - pad.b + 14)
    }
    ctx.fillStyle = '#374151'
    ctx.font = '11px sans-serif'
    ctx.fillText('distance along section (cells)', w / 2, h - 4)
    ctx.save()
    ctx.translate(12, h / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('depth (m, down)', 0, 0)
    ctx.restore()

    const n = d.section.horizons.length
    d.section.horizons.forEach((hz, i) => {
      const [r, g, b] = colormap(n > 2 ? i / (n - 1) : i)
      ctx.strokeStyle = `rgb(${r},${g},${b})`
      ctx.lineWidth = n > 2 ? 1.2 : 2
      ctx.beginPath()
      hz.forEach((z, k) => {
        const x = px(xs[k])
        const y = py(z)
        if (k === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    })
    if (n === 2) {
      // shade the sand body between base and top
      ctx.fillStyle = 'rgba(234, 179, 8, 0.35)'
      ctx.beginPath()
      d.section.horizons[1].forEach((z, k) => {
        const x = px(xs[k])
        if (k === 0) ctx.moveTo(x, py(z))
        else ctx.lineTo(x, py(z))
      })
      for (let k = xs.length - 1; k >= 0; k--) ctx.lineTo(px(xs[k]), py(d.section.horizons[0][k]))
      ctx.closePath()
      ctx.fill()
    }
    const marks = d.section.terminations ?? []
    marks.forEach((m) => {
      const info = terminationInfo[m.type]
      if (!info) return
      ctx.fillStyle = info.color
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(px(m.x), py(m.z), 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    })
    if (erosionLine) {
      ctx.strokeStyle = '#dc2626'
      ctx.lineWidth = 3
      ctx.beginPath()
      erosionLine.forEach((z, k) => {
        const x = px(xs[k])
        const y = py(z)
        if (k === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.fillStyle = '#dc2626'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('erosion surface', pad.l + 8, pad.t + 14)
    }
  }

  function renderFields(fields: NumField[]) {
    return fields.map((f) => (
      <div key={f.key}>
        <Label text={f.label} help={f.help} />
        <input
          type="number"
          step={f.step || 1}
          value={values[f.key] ?? ''}
          placeholder={feature === 'clinoforms' ? 'random' : undefined}
          onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
          className="w-full border rounded-md px-3 py-2"
        />
      </div>
    ))
  }

  function renderRange(label: string, help: string, value: [string, string], set: (v: [string, string]) => void) {
    return (
      <div>
        <Label text={label} help={help} />
        <div className="flex gap-2">
          <input type="number" value={value[0]} onChange={(e) => set([e.target.value, value[1]])} className="w-full border rounded-md px-3 py-2" />
          <input type="number" value={value[1]} onChange={(e) => set([value[0], e.target.value])} className="w-full border rounded-md px-3 py-2" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Mountain className="w-6 h-6" /> Feature Preview
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate a single geological feature on a small grid to inspect its shape before running the full pipeline
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Generate
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h3 className="font-semibold">Parameters</h3>
          <div className="flex gap-1">
            {(Object.keys(featureInfo) as FeatureKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setFeature(k)}
                className={`flex-1 px-2 py-1.5 text-sm rounded-md border ${feature === k ? 'bg-primary text-white' : 'hover:bg-muted'}`}
              >
                {featureInfo[k].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{featureInfo[feature].description}</p>

          <div>
            <Label text="Grid size (cells)" help={gridHelp} />
            <select value={cubeSize} onChange={(e) => setCubeSize(Number(e.target.value))} className="w-full border rounded-md px-3 py-2">
              {[60, 100, 150, 200, 300].map((s) => (
                <option key={s} value={s}>
                  {s} x {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label text="Seed" help={seedHelp} />
            <input type="number" value={seed} placeholder="random" onChange={(e) => setSeed(e.target.value)} className="w-full border rounded-md px-3 py-2" />
          </div>

          {feature === 'channels' && (
            <>
              {renderRange(
                'Channel count (min, max)',
                'How many channel belts a full run places, drawn between min and max. More channels mean more sinuous sand bodies at different depths. A preview always shows one channel.',
                countRange,
                setCountRange,
              )}
              {renderRange(
                'Channel width, m (min, max)',
                'Channel width in metres, drawn between min and max. Wider channels give broad belts with long, gentle bends; narrower ones give tight meanders that stay visible on small grids.',
                widthRange,
                setWidthRange,
              )}
              {renderFields(channelFields)}
            </>
          )}
          {feature === 'clinoforms' && (
            <>
              {renderFields([
                ...clinoformFields,
                {
                  key: 'channel_bin_size',
                  label: 'Cell size (m)',
                  step: 1,
                  help: 'Real-world size of one cell. It sets the horizontal scale: larger cells make the slope cover fewer cells, so the same grid spans more ground and the foreset looks shorter.',
                },
              ])}
              <div className="pt-2 border-t">
                <Label
                  text="Erosion surface"
                  help="Adds an erosional unconformity (sequence boundary). It cuts through the topset and upper foreset of everything older, truncating those clinoforms; younger clinoforms then downlap onto it and fill any incised valleys. Random adds it to about half of the packages."
                />
                <select value={erosion} onChange={(e) => setErosion(e.target.value as 'random' | 'on' | 'off')} className="w-full border rounded-md px-3 py-2">
                  <option value="random">Random</option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </div>
              {erosion !== 'off' && renderFields(erosionFields)}
            </>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Thickness map (m)</h3>
              {data && (
                <span className="text-xs text-muted-foreground">
                  max {data.max_thickness_m.toFixed(1)} m &middot; {data.covered_pct.toFixed(0)}% of area &middot; {data.elapsed_s}s
                  {Object.entries(data.info).map(([k, v]) => ` · ${k}: ${v}`)}
                </span>
              )}
            </div>
            <div className="flex items-start gap-4">
              <canvas ref={mapRef} width={360} height={360} className="border rounded" style={{ imageRendering: 'pixelated' }} />
              <div className="flex flex-col items-center text-xs text-muted-foreground">
                <span>{data ? data.max_thickness_m.toFixed(0) : ''}</span>
                <div
                  className="w-4 h-72 rounded my-1"
                  style={{ background: 'linear-gradient(to top, rgb(68,1,84), rgb(59,82,139), rgb(33,145,140), rgb(94,201,98), rgb(253,231,37))' }}
                />
                <span>0</span>
              </div>
              <p className="text-xs text-muted-foreground max-w-[200px]">The dashed red line is the section shown below.</p>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold mb-3">Cross-section</h3>
            <canvas ref={sectionRef} width={760} height={320} className="w-full border rounded" />
            {data?.section.terminations && (
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-sm">
                {Object.entries(terminationInfo).map(([type, info]) => {
                  const count = data.section.terminations!.filter((m) => m.type === type).length
                  return (
                    <div key={type} className={`flex items-center gap-1.5 ${count === 0 ? 'opacity-40' : ''}`}>
                      <span className="inline-block w-3 h-3 rounded-full" style={{ background: info.color }} />
                      <span>
                        {info.label} ({count})
                      </span>
                      <Help text={info.help} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
