import { useEffect, useState, useRef } from 'react'
import { Activity, Play, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { generateWavelet, generateWaveletBatch, WaveletParams, defaultWaveletParams, WaveletData } from '@/lib/api'

const waveletDescriptions: Record<string, string> = {
  ricker: 'Ricker wavelet (Mexican Hat) - Most commonly used wavelet in seismic processing. Characterized by a symmetric peak with side lobes.',
  ormsby: 'Ormsby wavelet - Four-point bandpass wavelet with specified low-cut, low-pass, high-pass, and high-cut frequencies.',
  Klauder: 'Klauder wavelet - Derived from Vibroseis sweep signal. Commonly used in land seismic surveys.',
}

export default function Wavelets() {
  const [params, setParams] = useState<WaveletParams>(defaultWaveletParams)
  const [waveletData, setWaveletData] = useState<WaveletData | null>(null)
  const [batchData, setBatchData] = useState<{ time: number[]; amplitude: number[]; frequency: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [showBatch, setShowBatch] = useState(false)
  const [polarity, setPolarity] = useState<1 | -1>(1)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const batchCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    handleGenerate()
  }, [])

  useEffect(() => {
    if (waveletData) {
      drawWavelet(canvasRef.current, waveletData.time, waveletData.amplitude, 'primary', polarity)
    }
  }, [waveletData, polarity])

  useEffect(() => {
    if (batchData.length > 0) {
      drawBatchWavelets(batchCanvasRef.current, batchData)
    }
  }, [batchData])

  async function handleGenerate() {
    setLoading(true)
    try {
      const data = await generateWavelet(params)
      setWaveletData(data)
      toast.success('Wavelet generated')
    } catch (error) {
      toast.error('Failed to generate wavelet')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleBatchGenerate() {
    setLoading(true)
    try {
      const data = await generateWaveletBatch(params, 3)
      setBatchData(data.wavelets)
      setShowBatch(true)
      toast.success('Batch wavelets generated')
    } catch (error) {
      toast.error('Failed to generate wavelets')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  function drawWavelet(canvas: HTMLCanvasElement | null, time: number[], amplitude: number[], color: string, polarity: number = 1) {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const padding = 50

    ctx.clearRect(0, 0, width, height)

    if (time.length === 0) return

    // Apply polarity
    const ampPolarity = amplitude.map(a => a * polarity)

    const minTime = Math.min(...time)
    const maxTime = Math.max(...time)
    const minAmp = Math.min(...ampPolarity)
    const maxAmp = Math.max(...ampPolarity)
    const absMaxAmp = Math.max(Math.abs(minAmp), Math.abs(maxAmp))

    // X scale
    const xScale = (width - padding * 2) / (maxTime - minTime)
    
    // Y scale - center at 0, symmetric
    const yZero = height / 2
    const yScale = (height / 2 - padding) / absMaxAmp

    // Draw grid
    ctx.strokeStyle = '#f3f4f6'
    ctx.lineWidth = 1
    
    // Horizontal grid lines
    for (let i = -3; i <= 3; i++) {
      const y = yZero - i * absMaxAmp * yScale / 3
      if (y > padding && y < height - padding) {
        ctx.beginPath()
        ctx.moveTo(padding, y)
        ctx.lineTo(width - padding, y)
        ctx.stroke()
      }
    }

    // Draw Y-axis (zero line) - prominent
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(padding, yZero)
    ctx.lineTo(width - padding, yZero)
    ctx.stroke()

    // Draw Y-axis
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padding, padding)
    ctx.lineTo(padding, height - padding)
    ctx.stroke()

    // Draw X-axis
    ctx.beginPath()
    ctx.moveTo(padding, height - padding)
    ctx.lineTo(width - padding, height - padding)
    ctx.stroke()

    // Draw wavelet
    ctx.strokeStyle = polarity === 1 ? '#3b82f6' : '#ef4444'
    ctx.lineWidth = 2
    ctx.beginPath()
    
    time.forEach((t, i) => {
      const x = padding + (t - minTime) * xScale
      const y = yZero - ampPolarity[i] * yScale
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.stroke()

    // Fill positive/negative areas
    ctx.fillStyle = polarity === 1 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)'
    ctx.beginPath()
    time.forEach((t, i) => {
      const x = padding + (t - minTime) * xScale
      const y = yZero - ampPolarity[i] * yScale
      if (i === 0) {
        ctx.moveTo(x, yZero)
        ctx.lineTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.lineTo(padding + (time[time.length - 1] - minTime) * xScale, yZero)
    ctx.closePath()
    ctx.fill()

    // Draw Y-axis labels (amplitude values)
    ctx.fillStyle = '#6b7280'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'
    
    const yTicks = 5
    for (let i = 0; i <= yTicks; i++) {
      const val = absMaxAmp * (i / yTicks)
      const y = yZero - val * yScale
      if (y > padding && y < height - padding) {
        ctx.fillText(val.toFixed(2), padding - 5, y + 3)
      }
      if (i > 0) {
        const yNeg = yZero + val * yScale
        if (yNeg > padding && yNeg < height - padding) {
          ctx.fillText((-val).toFixed(2), padding - 5, yNeg + 3)
        }
      }
    }
    // Zero label
    ctx.fillText('0', padding - 5, yZero + 3)

    // Draw X-axis labels (time values)
    ctx.textAlign = 'center'
    const timeTicks = 5
    for (let i = 0; i <= timeTicks; i++) {
      const t = minTime + (maxTime - minTime) * (i / timeTicks)
      const x = padding + t * xScale
      ctx.fillText(t.toFixed(0), x, height - padding + 15)
    }

    // Axis titles
    ctx.fillStyle = '#374151'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Time (ms)', width / 2, height - 10)
    
    ctx.save()
    ctx.translate(15, height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('Amplitude', 0, 0)
    ctx.restore()
  }

  function drawBatchWavelets(canvas: HTMLCanvasElement | null, wavelets: { time: number[]; amplitude: number[]; frequency: number }[]) {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const padding = 40

    ctx.clearRect(0, 0, width, height)

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

    // Find global min/max
    let minTime = Infinity, maxTime = -Infinity
    let minAmp = Infinity, maxAmp = -Infinity
    
    wavelets.forEach(w => {
      minTime = Math.min(minTime, ...w.time)
      maxTime = Math.max(maxTime, ...w.time)
      minAmp = Math.min(minAmp, ...w.amplitude)
      maxAmp = Math.max(maxAmp, ...w.amplitude)
    })

    const xScale = (width - padding * 2) / (maxTime - minTime)
    const yScale = (height - padding * 2 - 30 * wavelets.length) / (maxAmp - minAmp) / wavelets.length

    // Draw wavelets with offset
    wavelets.forEach((wavelet, idx) => {
      const yOffset = padding + idx * 30
      
      ctx.strokeStyle = colors[idx % colors.length]
      ctx.lineWidth = 1.5
      ctx.beginPath()
      
      wavelet.time.forEach((t, i) => {
        const x = padding + (t - minTime) * xScale
        const y = yOffset + height / 4 - (wavelet.amplitude[i] - (maxAmp + minAmp) / 2) * yScale
        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      })
      ctx.stroke()
      
      // Label
      ctx.fillStyle = colors[idx % colors.length]
      ctx.font = '11px sans-serif'
      ctx.fillText(`f=${wavelet.frequency.toFixed(1)} Hz`, width - 80, yOffset + 10)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Wavelet Modeling</h2>
          <p className="text-sm text-muted-foreground mt-1">Generate and visualize seismic wavelets</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Generate
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Parameters Panel */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="font-semibold mb-4">Wavelet Parameters</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Wavelet Type</label>
              <select
                value={params.wavelet_type}
                onChange={(e) => setParams({ ...params, wavelet_type: e.target.value })}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="ricker">Ricker (Mexican Hat)</option>
                <option value="ormsby">Ormsby</option>
                <option value="klauder">Klauder</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                {waveletDescriptions[params.wavelet_type]}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Frequency (Hz)
                <span className="text-muted-foreground font-normal ml-2">- Center frequency</span>
              </label>
              <input
                type="number"
                value={params.frequency}
                onChange={(e) => setParams({ ...params, frequency: parseFloat(e.target.value) })}
                min={1}
                max={100}
                step={1}
                className="w-full border rounded-md px-3 py-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Lower = longer wavelength, Higher = shorter wavelength
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Sample Rate (dt in ms)
              </label>
              <select
                value={params.dt}
                onChange={(e) => setParams({ ...params, dt: parseFloat(e.target.value) })}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value={1}>1 ms (high resolution)</option>
                <option value={2}>2 ms</option>
                <option value={4}>4 ms (standard)</option>
                <option value={8}>8 ms</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Convolutions
                <span className="text-muted-foreground font-normal ml-2">- Number of self-convolutions</span>
              </label>
              <input
                type="number"
                value={params.convolutions}
                onChange={(e) => setParams({ ...params, convolutions: parseInt(e.target.value) })}
                min={1}
                max={4}
                className="w-full border rounded-md px-3 py-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                More convolutions = broader spectrum
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Duration (ms)
              </label>
              <input
                type="number"
                value={params.duration_ms}
                onChange={(e) => setParams({ ...params, duration_ms: parseFloat(e.target.value) })}
                min={50}
                max={500}
                step={50}
                className="w-full border rounded-md px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Polarity</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPolarity(1)}
                  className={`flex-1 px-3 py-2 rounded-md border text-sm ${
                    polarity === 1 
                      ? 'bg-blue-50 border-blue-500 text-blue-700' 
                      : 'hover:bg-muted'
                  }`}
                >
                  Normal
                  <span className="block text-xs opacity-70">Peak = +</span>
                </button>
                <button
                  onClick={() => setPolarity(-1)}
                  className={`flex-1 px-3 py-2 rounded-md border text-sm ${
                    polarity === -1 
                      ? 'bg-red-50 border-red-500 text-red-700' 
                      : 'hover:bg-muted'
                  }`}
                >
                  Reverse
                  <span className="block text-xs opacity-70">Peak = −</span>
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                SEG normal polarity: positive reflection = peak (blue), negative = trough (red)
              </p>
            </div>

            <button 
              onClick={handleBatchGenerate}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border rounded-md hover:bg-muted disabled:opacity-50"
            >
              <Activity className="w-4 h-4" />
              Generate Multiple
            </button>
          </div>
        </div>

        {/* Wavelet Visualization */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Wavelet */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Wavelet Shape</h3>
              {waveletData && (
                <span className="text-sm text-muted-foreground">
                  f = {params.frequency} Hz, dt = {params.dt} ms
                </span>
              )}
            </div>
            <canvas
              ref={canvasRef}
              width={600}
              height={300}
              className="w-full border rounded bg-gray-50"
            />
            
            {waveletData && (
              <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
                <div className="bg-muted/50 p-3 rounded">
                  <p className="text-muted-foreground">Peak Frequency</p>
                  <p className="font-semibold">{params.frequency} Hz</p>
                </div>
                <div className="bg-muted/50 p-3 rounded">
                  <p className="text-muted-foreground">Duration</p>
                  <p className="font-semibold">{params.duration_ms} ms</p>
                </div>
                <div className="bg-muted/50 p-3 rounded">
                  <p className="text-muted-foreground">Sample Rate</p>
                  <p className="font-semibold">{params.dt} ms</p>
                </div>
                <div className="bg-muted/50 p-3 rounded">
                  <p className="text-muted-foreground">Polarity</p>
                  <p className="font-semibold">{polarity === 1 ? 'Normal' : 'Reversed'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Batch Wavelets */}
          {showBatch && batchData.length > 0 && (
            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Multiple Wavelets</h3>
                <button 
                  onClick={() => setShowBatch(false)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Hide
                </button>
              </div>
              <canvas
                ref={batchCanvasRef}
                width={600}
                height={150}
                className="w-full border rounded bg-gray-50"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Generated with ±15% random frequency variation to simulate real seismic data
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
