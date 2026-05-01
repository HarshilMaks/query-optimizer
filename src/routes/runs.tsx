import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { AppLayout, Badge, Skeleton } from '@/components/AppLayout'
import { Loader2, Play } from 'lucide-react'
import { getAccessToken } from '@/lib/auth-hooks'

export const Route = createFileRoute('/runs')({
  beforeLoad: async () => {
    const token = getAccessToken()
    if (!token) {
      throw new Error('Unauthorized: Please log in')
    }
  },
  component: RunsPage,
})

function RunsPage() {
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await api.runs.list()
      setRuns(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function runScan() {
    setStarting(true)
    try {
      await api.runs.scan()
      await load()
    } finally {
      setStarting(false)
    }
  }

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Runs</h1>
            <p className="text-slate-400 text-sm mt-0.5">Scan history and orchestration results</p>
          </div>
          <button
            onClick={runScan}
            disabled={starting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Run Full Scan
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Run</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Started</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Summary</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800/50"><td colSpan={4} className="px-4 py-3"><Skeleton className="h-4" /></td></tr>
              )) : runs.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-16 text-center text-slate-500">No runs yet. Start your first scan.</td></tr>
              ) : runs.map((run) => (
                <tr key={run.id} className="border-b border-slate-800/50">
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-200">{run.type}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{run.id}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(run.started_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {run.summary ? `${run.summary.total_saved_queries ?? 0} queries · ${run.summary.scanned_connections ?? 0} connections` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right"><Badge variant={run.status}>{run.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  )
}
