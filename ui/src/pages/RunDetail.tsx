import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle, XCircle, Clock, RefreshCw, Image, Terminal, ChevronDown, ChevronRight, Waves, Grid3X3, Box } from 'lucide-react'
import { getRun, getRunQCImages, getRunVolumes, getVolumeSliceUrl, RunResponse, QCImage, ModelConfig, VolumeInfo } from '@/lib/api'

const stepLabels: Record<string, string> = {
  initialized: 'Initializing',
  starting: 'Starting',
  config: 'Writing Config',
  horizons: 'Building Horizons',
  facies: 'Creating Facies',
  geomodel: 'Building Models',
  faults: 'Applying Faults',
  closures: 'Finding Closures',
  elastic: 'Elastic Props',
  seismic: 'Seismic Volumes',
  output: 'Writing Output',
  completed: 'Completed',
}

const configKeyLabels: Record<string, { label: string; section: string }> = {
  project: { label: 'Project', section: 'Model' },
  project_folder: { label: 'Output Folder', section: 'Model' },
  cube_shape: { label: 'Cube Size [X,Y,Z]', section: 'Model' },
  incident_angles: { label: 'Incident Angles', section: 'Model' },
  include_salt: { label: 'Include Salt', section: 'Features' },
  basin_floor_fans: { label: 'Basin Floor Fans', section: 'Features' },
  closure_types: { label: 'Closure Types', section: 'Closures' },
  min_number_faults: { label: 'Min Faults', section: 'Faults' },
  max_number_faults: { label: 'Max Faults', section: 'Faults' },
  thickness_min: { label: 'Min Layer Thickness', section: 'Layers' },
  thickness_max: { label: 'Max Layer Thickness', section: 'Layers' },
  signal_to_noise_ratio_db: { label: 'SNR (dB)', section: 'Seismic' },
  bandwidth_low: { label: 'Bandwidth Low (Hz)', section: 'Seismic' },
  bandwidth_high: { label: 'Bandwidth High (Hz)', section: 'Seismic' },
}

function ConfigSummary({ config }: { config: ModelConfig }) {
  const [expanded, setExpanded] = useState(false)
  
  const displayKeys = ['project', 'cube_shape', 'incident_angles', 'include_salt', 'basin_floor_fans', 'closure_types', 'min_number_faults', 'max_number_faults', 'signal_to_noise_ratio_db']
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted"
      >
        <span className="font-medium">Configuration Summary</span>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {expanded && (
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          {displayKeys.map(key => {
            const info = configKeyLabels[key]
            const value = (config as Record<string, unknown>)[key]
            return (
              <div key={key}>
                <p className="text-muted-foreground text-xs">{info?.label || key}</p>
                <p className="font-medium">
                  {Array.isArray(value) ? value.join(', ') : String(value)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProgressBar({ progress, currentStep }: { progress: number; currentStep?: string }) {
  const step = stepLabels[currentStep || 'initialized'] || currentStep
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Progress: {progress}%</span>
        <span className="font-medium">{step}</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div 
          className={`h-2 rounded-full transition-all ${
            progress === 100 ? 'bg-green-500' : 'bg-primary'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

function LogConsole({ logs }: { logs: string[] }) {
  const [expanded, setExpanded] = useState(true)
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          <span className="font-medium">Console Output</span>
          <span className="text-xs text-muted-foreground">({logs.length} messages)</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {expanded && (
        <div className="p-4 bg-gray-900 max-h-64 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <span className="text-gray-500">No messages yet...</span>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={`mb-1 ${log.includes('ERROR') ? 'text-red-400' : log.includes('Warning') ? 'text-yellow-400' : 'text-green-400'}`}>
                <span className="text-gray-500">[{i.toString().padStart(3, '0')}]</span> {log}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function RunDetail() {
  const { id } = useParams<{ id: string }>()
  const [run, setRun] = useState<RunResponse | null>(null)
  const [qcImages, setQcImages] = useState<QCImage[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  
  // Volume visualization state
  const [volumes, setVolumes] = useState<VolumeInfo[]>([])
  const [selectedVolumes, setSelectedVolumes] = useState<Set<string>>(new Set())
  const [volumeSliceIndex, setVolumeSliceIndex] = useState(300)
  const [volumeSliceType, setVolumeSliceType] = useState<'depth' | 'inline' | 'crossline'>('depth')
  const [activeVolumeTab, setActiveVolumeTab] = useState<'qc' | 'volumes'>('qc')

  useEffect(() => {
    if (id) loadRun()
  }, [id])

  // Auto-refresh for running jobs
  useEffect(() => {
    if (!run || run.status === 'running' || run.status === 'pending') {
      const interval = setInterval(() => {
        if (id && autoRefresh) {
          getRun(id).then(data => {
            setRun(data)
            if (data.status === 'completed' && data.id === id) {
              getRunQCImages(id).then(setQcImages)
            }
          }).catch(console.error)
        }
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [run?.status, id, autoRefresh])

  async function loadRun() {
    if (!id) return
    try {
      const data = await getRun(id)
      setRun(data)
      if (data.status === 'completed') {
        const [images, vols] = await Promise.all([
          getRunQCImages(id),
          getRunVolumes(id)
        ])
        setQcImages(images)
        setVolumes(vols)
        
        // Auto-select seismic volumes by default
        const seismicVolumes = vols.filter(v => 
          v.name.toLowerCase().includes('seismic') || 
          v.name.toLowerCase().includes('rfc')
        )
        if (seismicVolumes.length > 0) {
          setSelectedVolumes(new Set(seismicVolumes.map(v => v.name)))
        }
      }
    } catch (error) {
      console.error('Failed to load run:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  if (!run) {
    return <div className="text-center py-8">Run not found</div>
  }

  const statusConfig = {
    completed: { icon: CheckCircle, color: 'text-green-600', label: 'Completed', bg: 'bg-green-50' },
    running: { icon: Clock, color: 'text-yellow-600', label: 'Running', bg: 'bg-yellow-50' },
    failed: { icon: XCircle, color: 'text-red-600', label: 'Failed', bg: 'bg-red-50' },
    pending: { icon: Clock, color: 'text-gray-400', label: 'Pending', bg: 'bg-gray-50' },
    cancelled: { icon: XCircle, color: 'text-gray-400', label: 'Cancelled', bg: 'bg-gray-50' },
  }
  const status = statusConfig[run.status as keyof typeof statusConfig]
  const StatusIcon = status.icon

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/runs" className="p-2 hover:bg-muted rounded-md">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h2 className="text-2xl font-bold">Run Details</h2>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input 
            type="checkbox" 
            checked={autoRefresh} 
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          Auto-refresh
        </label>
      </div>

      {/* Status & Progress Card */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <StatusIcon className={`w-8 h-8 ${status.color}`} />
            <div>
              <h3 className="text-lg font-semibold">{run.config_name}</h3>
              <p className="text-sm text-muted-foreground font-mono">{run.id}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.color} ${status.bg}`}>
            {status.label}
          </span>
        </div>

        {/* Progress Bar */}
        {(run.status === 'running' || run.status === 'pending') && (
          <ProgressBar progress={run.progress} currentStep={run.current_step} />
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t text-sm">
          <div>
            <p className="text-muted-foreground">Created</p>
            <p className="font-medium">{new Date(run.created_at).toLocaleString()}</p>
          </div>
          {run.started_at && (
            <div>
              <p className="text-muted-foreground">Started</p>
              <p className="font-medium">{new Date(run.started_at).toLocaleString()}</p>
            </div>
          )}
          {run.completed_at && (
            <div>
              <p className="text-muted-foreground">Completed</p>
              <p className="font-medium">{new Date(run.completed_at).toLocaleString()}</p>
            </div>
          )}
          {run.started_at && run.completed_at && (
            <div>
              <p className="text-muted-foreground">Duration</p>
              <p className="font-medium">
                {Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s
              </p>
            </div>
          )}
        </div>

        {/* Error Display */}
        {run.error_message && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 font-medium flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Error
            </p>
            <pre className="text-red-600 text-sm mt-2 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
              {run.error_message}
            </pre>
          </div>
        )}

        {run.output_folder && (
          <div className="mt-4">
            <p className="text-muted-foreground text-sm">Output Folder</p>
            <p className="font-mono text-sm bg-muted p-2 rounded mt-1 break-all">{run.output_folder}</p>
          </div>
        )}
      </div>

      {/* Console Logs */}
      <LogConsole logs={run.log_messages || []} />

      {/* Configuration Summary */}
      <ConfigSummary config={run.config} />

      {/* QC Images & Volume Visualization Tabs */}
      <div className="bg-white rounded-lg border">
        <div className="flex items-center gap-2 p-4 border-b">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveVolumeTab('qc')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeVolumeTab === 'qc' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Image className="w-4 h-4" />
              QC Images
              {qcImages.length > 0 && (
                <span className="text-xs opacity-70">({qcImages.length})</span>
              )}
            </button>
            <button
              onClick={() => setActiveVolumeTab('volumes')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeVolumeTab === 'volumes' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
              Volume Slices
              {volumes.length > 0 && (
                <span className="text-xs opacity-70">({volumes.length})</span>
              )}
            </button>
          </div>
        </div>

        {/* QC Images Tab */}
        {activeVolumeTab === 'qc' && (
          <div>
            {qcImages.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {run.status === 'completed' ? 'No QC images available' : 'Run must be completed to view QC images'}
              </div>
            ) : (
              <div className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {qcImages.map((img) => (
                    <div
                      key={img.name}
                      className="cursor-pointer hover:opacity-80 transition-opacity border rounded-md overflow-hidden group"
                      onClick={() => setSelectedImage(img.url)}
                      title={img.description}
                    >
                      <img
                        src={img.url}
                        alt={img.title}
                        className="w-full h-32 object-cover"
                      />
                      <div className="p-2 bg-muted/30">
                        <p className="text-xs font-medium truncate">{img.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {img.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Volume Slices Tab */}
        {activeVolumeTab === 'volumes' && (
          <div className="p-4">
            {run.status !== 'completed' ? (
              <div className="text-center text-muted-foreground py-8">
                Run must be completed to view volume slices
              </div>
            ) : volumes.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No volumes available for visualization
              </div>
            ) : (
              <div className="space-y-4">
                {/* Volume Controls */}
                <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/50 rounded-md">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Slice Index:</label>
                    <input
                      type="number"
                      value={volumeSliceIndex}
                      onChange={(e) => setVolumeSliceIndex(parseInt(e.target.value) || 0)}
                      className="w-20 px-2 py-1 text-sm border rounded"
                      min="0"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Slice Type:</label>
                    <select
                      value={volumeSliceType}
                      onChange={(e) => setVolumeSliceType(e.target.value as 'depth' | 'inline' | 'crossline')}
                      className="px-2 py-1 text-sm border rounded"
                    >
                      <option value="depth">Depth (Z)</option>
                      <option value="inline">Inline (X)</option>
                      <option value="crossline">Crossline (Y)</option>
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      // Reset to default seismic volumes
                      const seismicVolumes = volumes.filter(v => 
                        v.name.toLowerCase().includes('seismic') || 
                        v.name.toLowerCase().includes('rfc')
                      )
                      if (seismicVolumes.length > 0) {
                        setSelectedVolumes(new Set(seismicVolumes.map(v => v.name)))
                      }
                    }}
                    className="px-3 py-1 text-sm bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
                  >
                    Reset to Default
                  </button>
                  <button
                    onClick={() => setSelectedVolumes(new Set())}
                    className="px-3 py-1 text-sm bg-muted hover:bg-muted/80 rounded-md transition-colors"
                  >
                    Clear All
                  </button>
                </div>

                {/* Volume Checkboxes */}
                <div className="border rounded-md p-3">
                  <p className="text-sm font-medium mb-2">Select Volumes:</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {volumes.map((vol) => (
                      <label
                        key={vol.name}
                        className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedVolumes.has(vol.name)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedVolumes)
                            if (e.target.checked) {
                              newSelected.add(vol.name)
                            } else {
                              newSelected.delete(vol.name)
                            }
                            setSelectedVolumes(newSelected)
                          }}
                          className="w-4 h-4"
                        />
                        <div className="min-w-0">
                          <p className="text-sm truncate" title={vol.name}>{vol.name}</p>
                          <p className="text-xs text-muted-foreground">{vol.shape.join('×')}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Selected Volume Slices */}
                {selectedVolumes.size > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">
                      Selected Volumes ({selectedVolumes.size}):
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Array.from(selectedVolumes).map((volumeName) => {
                        const vol = volumes.find(v => v.name === volumeName)
                        if (!vol) return null
                        return (
                          <div
                            key={volumeName}
                            className="border rounded-md overflow-hidden"
                          >
                            <img
                              src={getVolumeSliceUrl(id!, volumeName, volumeSliceIndex, volumeSliceType)}
                              alt={`${volumeName} - ${volumeSliceType} ${volumeSliceIndex}`}
                              className="w-full h-48 object-contain bg-black"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect fill="%23eee" width="100%25" height="100%25"/><text fill="%23999" x="50%25" y="50%25" text-anchor="middle" font-family="sans-serif">Error loading slice</text></svg>'
                              }}
                            />
                            <div className="p-2 bg-muted/30">
                              <p className="text-xs truncate font-medium">{volumeName}</p>
                              <p className="text-xs text-muted-foreground">
                                {volumeSliceType} slice at index {volumeSliceIndex}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image Viewer Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          {/* Get title from selected image */}
          {(() => {
            const selectedImg = qcImages.find(img => img.url === selectedImage);
            return selectedImg ? (
              <div className="text-white mb-4 text-center">
                <h3 className="text-lg font-semibold">{selectedImg.title}</h3>
                <p className="text-sm text-gray-300">{selectedImg.description}</p>
              </div>
            ) : null;
          })()}
          <img 
            src={selectedImage} 
            alt="QC" 
            className="max-w-full max-h-[80vh] rounded-md object-contain" 
          />
          <p className="text-white/50 text-sm mt-4">Click anywhere to close</p>
        </div>
      )}
    </div>
  )
}
