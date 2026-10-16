import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, CheckCircle, XCircle, Clock, Trash2, Play, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { getRuns, deleteRun, cancelRun, getConfigs, getConfig, createRun, RunResponse, ConfigSummary, ModelConfig, defaultConfig } from '@/lib/api'

export default function Runs() {
  const navigate = useNavigate()
  const [runs, setRuns] = useState<RunResponse[]>([])
  const [configs, setConfigs] = useState<ConfigSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewRun, setShowNewRun] = useState(false)
  const [selectedConfig, setSelectedConfig] = useState('')
  const [configPreview, setConfigPreview] = useState<ModelConfig | null>(null)
  const [runId, setRunId] = useState('')
  const [testMode, setTestMode] = useState(true)
  const [testModeValue, setTestModeValue] = useState(50)

  useEffect(() => {
    loadRuns()
    loadConfigs()
  }, [])

  async function loadRuns() {
    try {
      const data = await getRuns()
      setRuns(data)
    } catch (error) {
      console.error('Failed to load runs:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadConfigs() {
    try {
      const data = await getConfigs()
      setConfigs(data)
    } catch (error) {
      console.error('Failed to load configs:', error)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this run?')) return
    try {
      await deleteRun(id)
      toast.success('Run deleted')
      loadRuns()
    } catch (error) {
      toast.error('Failed to delete run')
    }
  }

  async function handleCancel(id: string) {
    try {
      await cancelRun(id)
      toast.success('Run cancelled')
      loadRuns()
    } catch (error) {
      toast.error('Failed to cancel run')
    }
  }

  async function handleStartRun() {
    console.log('handleStartRun called, selectedConfig:', selectedConfig)
    if (!selectedConfig) {
      toast.error('Please select a config')
      return
    }
    try {
      let config: ModelConfig
      console.log('Loading config for:', selectedConfig)
      if (selectedConfig === '__default__') {
        console.log('Using default config')
        config = defaultConfig
      } else {
        console.log('Fetching config from API:', selectedConfig)
        config = await getConfig(selectedConfig)
        console.log('Config loaded successfully:', config)
      }
      console.log('Creating run with config:', selectedConfig)
      const run = await createRun(selectedConfig, config, 1, runId || undefined, testMode ? testModeValue : undefined)
      console.log('Run created:', run)
      toast.success('Run started')
      setShowNewRun(false)
      setSelectedConfig('')
      setRunId('')
      navigate(`/runs/${run.id}`)
    } catch (error) {
      console.error('Error starting run:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to start run'
      toast.error(errorMessage)
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'running': return <Clock className="w-5 h-5 text-yellow-600 animate-pulse" />
      case 'failed': return <XCircle className="w-5 h-5 text-red-600" />
      default: return <Clock className="w-5 h-5 text-gray-400" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Runs</h2>
        <button
          onClick={() => setShowNewRun(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Run
        </button>
      </div>

      {showNewRun && (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h3 className="font-semibold text-lg">Start New Run</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Configuration</label>
              <select
                value={selectedConfig}
                onChange={(e) => setSelectedConfig(e.target.value)}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="">Select a config...</option>
                <option value="__default__">Default Config</option>
                {configs.map((config) => (
                  <option key={config.name} value={config.name}>{config.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Run ID (optional)</label>
              <input
                type="text"
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                placeholder="my-run"
                className="w-full border rounded-md px-3 py-2"
              />
            </div>
          </div>
          
          {/* Test Mode Options */}
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={testMode}
                onChange={(e) => setTestMode(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm font-medium">Test Mode</span>
            </label>
            {testMode && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Cube size multiplier:</label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={testModeValue}
                  onChange={(e) => setTestModeValue(parseInt(e.target.value) || 50)}
                  className="w-20 border rounded px-2 py-1 text-sm"
                />
                <span className="text-xs text-muted-foreground">(smaller = faster)</span>
              </div>
            )}
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleStartRun}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
            >
              <Play className="w-4 h-4" />
              Start Run
            </button>
            <button
              onClick={() => { setShowNewRun(false); setSelectedConfig(''); setRunId(''); }}
              className="px-4 py-2 border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border">
        {loading ? (
          <div className="p-8 text-center">Loading...</div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No runs yet. Click "New Run" to start generating synthetic seismic data.
          </div>
        ) : (
          <div className="divide-y">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between p-4">
                <Link
                  to={`/runs/${run.id}`}
                  className="flex items-center gap-4 flex-1 hover:bg-muted/50 transition-colors -m-4 p-4"
                >
                  {statusIcon(run.status)}
                  <div className="flex-1">
                    <p className="font-medium">{run.config_name}</p>
                    <p className="text-sm text-muted-foreground">{run.id}</p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{new Date(run.created_at).toLocaleString()}</p>
                    {run.completed_at && (
                      <p>Duration: {Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at || run.created_at).getTime()) / 1000)}s</p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </Link>
                <div className="flex items-center gap-2 ml-4">
                  {run.status === 'running' && (
                    <button
                      onClick={() => handleCancel(run.id)}
                      className="p-2 text-muted-foreground hover:text-red-600 transition-colors"
                      title="Cancel"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(run.id)}
                    className="p-2 text-muted-foreground hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
