import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, CheckCircle, XCircle, Clock, Plus, Database, Layers, ChevronDown, ChevronUp } from 'lucide-react'
import { getDashboardStats, getRuns, getDatasets, DashboardStats, RunResponse, DatasetResponse } from '@/lib/api'

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentRuns, setRecentRuns] = useState<RunResponse[]>([])
  const [recentDatasets, setRecentDatasets] = useState<DatasetResponse[]>([])
  const [loading, setLoading] = useState(true)
  
  // Collapsible sections - default to collapsed
  const [showRecentRuns, setShowRecentRuns] = useState(false)
  const [showRecentDatasets, setShowRecentDatasets] = useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, runsData, datasetsData] = await Promise.all([
          getDashboardStats(),
          getRuns(),
          getDatasets()
        ])
        setStats(statsData)
        setRecentRuns(runsData.slice(0, 5))
        // Show only completed datasets, most recent first
        const completedDatasets = datasetsData
          .filter(d => d.status === 'completed')
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setRecentDatasets(completedDatasets.slice(0, 5))
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  const statCards = [
    { label: 'Total Runs', value: stats?.total_runs ?? 0, icon: Play, color: 'text-blue-600' },
    { label: 'Completed', value: stats?.completed_runs ?? 0, icon: CheckCircle, color: 'text-green-600' },
    { label: 'Running', value: stats?.running_runs ?? 0, icon: Clock, color: 'text-yellow-600' },
    { label: 'Failed', value: stats?.failed_runs ?? 0, icon: XCircle, color: 'text-red-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <Link
          to="/runs"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Run
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                </div>
                <Icon className={`w-8 h-8 ${card.color}`} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent Runs - Collapsible */}
      <div className="bg-white rounded-lg border">
        <button
          onClick={() => setShowRecentRuns(!showRecentRuns)}
          className="w-full flex items-center justify-between p-4 border-b hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Recent Runs</h3>
            <span className="text-xs text-muted-foreground">({recentRuns.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/runs" className="text-sm text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
              View all
            </Link>
            {showRecentRuns ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </button>
        {showRecentRuns && (
          recentRuns.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No runs yet. Start a new run to generate synthetic seismic data.
            </div>
          ) : (
            <div className="divide-y">
              {recentRuns.map((run) => (
                <Link
                  key={run.id}
                  to={`/runs/${run.id}`}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {run.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-600" />}
                    {run.status === 'running' && <Clock className="w-5 h-5 text-yellow-600" />}
                    {run.status === 'failed' && <XCircle className="w-5 h-5 text-red-600" />}
                    {run.status === 'pending' && <Clock className="w-5 h-5 text-gray-400" />}
                    {run.status === 'cancelled' && <XCircle className="w-5 h-5 text-gray-400" />}
                    <div>
                      <p className="font-medium">{run.config_name}</p>
                      <p className="text-sm text-muted-foreground">{run.id}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      {new Date(run.created_at).toLocaleString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}
      </div>

      {/* Dataset Pipeline Section */}
      <div className="mt-8 pt-8 border-t-2 border-dashed border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold">Dataset Pipeline</h2>
          </div>
          <Link
            to="/datasets"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Layers className="w-4 h-4" />
            Create Dataset
          </Link>
        </div>

        {/* Dataset Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700 font-medium">Total Datasets</p>
                <p className="text-3xl font-bold text-blue-900 mt-1">{stats?.total_datasets ?? 0}</p>
              </div>
              <Database className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700 font-medium">Completed</p>
                <p className="text-3xl font-bold text-green-900 mt-1">{stats?.completed_datasets ?? 0}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-700 font-medium">Training Samples</p>
                <p className="text-3xl font-bold text-purple-900 mt-1">
                  {stats?.total_train_samples?.toLocaleString() ?? 0}
                </p>
              </div>
              <Layers className="w-8 h-8 text-purple-600" />
            </div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-amber-700 font-medium">Validation Samples</p>
                <p className="text-3xl font-bold text-amber-900 mt-1">
                  {stats?.total_val_samples?.toLocaleString() ?? 0}
                </p>
              </div>
              <Layers className="w-8 h-8 text-amber-600" />
            </div>
          </div>
        </div>

        {/* Recent Datasets - Collapsible */}
        <div className="bg-white rounded-lg border">
          <button
            onClick={() => setShowRecentDatasets(!showRecentDatasets)}
            className="w-full flex items-center justify-between p-4 border-b bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold">Recent Completed Datasets</h3>
              <span className="text-xs text-muted-foreground">({recentDatasets.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/datasets" className="text-sm text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                View all
              </Link>
              {showRecentDatasets ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </div>
          </button>
          {showRecentDatasets && (
            recentDatasets.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No completed datasets yet. Create a dataset from your runs to generate training data.
              </div>
            ) : (
              <div className="divide-y">
                {recentDatasets.map((dataset) => (
                  <Link
                    key={dataset.id}
                    to="/datasets"
                    className="flex items-center justify-between p-4 hover:bg-blue-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-medium">{dataset.name}</p>
                        <p className="text-sm text-muted-foreground capitalize">{dataset.task_type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {dataset.sample_counts.train.toLocaleString()} train / {dataset.sample_counts.validation.toLocaleString()} val
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(dataset.created_at).toLocaleString()}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
