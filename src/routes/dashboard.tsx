import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { AppLayout, StatCard, Badge, Skeleton } from '@/components/AppLayout'
import { RefreshCw, Search, ChevronUp, ChevronDown, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/dashboard')({ component: DashboardPage })

type SortKey = 'mean_exec_time_ms' | 'total_calls' | 'total_exec_time_ms' | 'last_seen_at'

function DashboardPage() {
  const [queries, setQueries] = useState<any[]>([])
  const [connections, setConnections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [analyzingAll, setAnalyzingAll] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('mean_exec_time_ms')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [pgStatWarning, setPgStatWarning] = useState(false)
  const [activeConnId, setActiveConnId] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [q, c] = await Promise.all([api.queries.list(), api.connections.list()])
      setQueries(q)
      setConnections(c)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleRefresh() {
    const connId = activeConnId || connections[0]?.id
    if (!connId) return
    setRefreshing(true)
    try {
      const result = await api.queries.refresh(connId)
      if (result.pgStatEnabled === false) setPgStatWarning(true)
      else { setPgStatWarning(false); await loadData() }
    } catch (err: any) {
      if (err.message?.includes('pg_stat_statements')) setPgStatWarning(true)
    } finally {
      setRefreshing(false)
    }
  }

  async function handleAnalyzeAll() {
    const pending = filtered.filter(q => q.status === 'pending').slice(0, 5)
    if (pending.length === 0) return
    setAnalyzingAll(true)
    for (const q of pending) {
      try {
        await api.queries.explain(q.id)
        await api.queries.analyze(q.id)
      } catch {}
    }
    await loadData()
    setAnalyzingAll(false)
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = queries
    .filter(q => {
      if (search && !q.query_text?.toLowerCase().includes(search.toLowerCase())) return false
      if (filterStatus && q.status !== filterStatus) return false
      return true
    })
    .sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'last_seen_at') return mult * (new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime())
      return mult * ((a[sortKey] ?? 0) - (b[sortKey] ?? 0))
    })

  const appliedCount = queries.filter(q => q.status === 'optimized').length
  const timeSaved = queries.filter(q => q.status === 'optimized').reduce((sum, q) => sum + (q.mean_exec_time_ms ?? 0) * (q.total_calls ?? 0) / (1000 * 86400), 0)

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronUp size={12} className="text-slate-600" />
    return sortDir === 'asc' ? <ChevronUp size={12} className="text-blue-400" /> : <ChevronDown size={12} className="text-blue-400" />
  }

  function timeColor(ms: number) {
    if (ms >= 1000) return 'text-red-400'
    if (ms >= 200) return 'text-amber-400'
    return 'text-emerald-400'
  }

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-slate-400 text-sm mt-0.5">Monitor and optimize your PostgreSQL queries</p>
          </div>
          <div className="flex gap-3">
            {connections.length > 1 && (
              <select value={activeConnId} onChange={e => setActiveConnId(e.target.value)} className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none">
                <option value="">All connections</option>
                {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button onClick={handleRefresh} disabled={refreshing || connections.length === 0} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-white rounded-lg transition-colors disabled:opacity-50">
              {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh Queries
            </button>
            <button onClick={handleAnalyzeAll} disabled={analyzingAll} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-sm text-white rounded-lg transition-colors disabled:opacity-50">
              {analyzingAll && <Loader2 size={14} className="animate-spin" />}
              Analyze All Pending
            </button>
          </div>
        </div>

        {pgStatWarning && (
          <div className="mb-6 p-4 bg-amber-900/20 border border-amber-700/50 rounded-xl flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-400">pg_stat_statements is not enabled</p>
              <p className="text-xs text-slate-400 mt-1">Run to enable:</p>
              <code className="block font-mono text-xs text-amber-300 bg-slate-900 rounded px-3 py-2 mt-2">
                CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
              </code>
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-4 mb-6">
          {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />) : (
            <>
              <StatCard label="Slow Queries Detected" value={queries.length} accent="text-red-400" />
              <StatCard label="Est. Time Saved / Day" value={`${timeSaved.toFixed(1)}s`} accent="text-emerald-400" />
              <StatCard label="Optimizations Applied" value={appliedCount} accent="text-blue-400" />
              <StatCard label="Active Connections" value={connections.length} />
            </>
          )}
        </div>

        <div className="flex gap-3 mb-4">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search queries..." className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="analyzed">Analyzed</option>
            <option value="optimized">Optimized</option>
          </select>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Query</th>
                {([['mean_exec_time_ms', 'Mean Time'], ['total_calls', 'Calls'], ['total_exec_time_ms', 'Total Time'], ['last_seen_at', 'Last Seen']] as [SortKey, string][]).map(([k, label]) => (
                  <th key={k} onClick={() => toggleSort(k)} className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 text-right">
                    <div className="flex items-center gap-1 justify-end">{label} <SortIcon k={k} /></div>
                  </th>
                ))}
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800/50"><td colSpan={6} className="px-4 py-3"><Skeleton className="h-4" /></td></tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-16 text-center">
                  {queries.length === 0 ? (
                    <div>
                      <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3" />
                      <p className="text-white font-medium">No slow queries detected — your database looks healthy!</p>
                      <p className="text-slate-400 text-sm mt-1">Connect a database and click "Refresh Queries" to start.</p>
                      <Link to="/connect" className="inline-flex mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                        Connect Database
                      </Link>
                    </div>
                  ) : <p className="text-slate-500">No queries match your filters</p>}
                </td></tr>
              ) : filtered.map(q => (
                <tr key={q.id} className="border-b border-slate-800/50 hover:bg-slate-800/40 cursor-pointer transition-colors" onClick={() => window.location.href = `/query/${q.id}`}>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-300 max-w-sm truncate" title={q.query_text}>{q.query_text?.substring(0, 80) ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-right"><span className={`font-semibold text-sm font-mono ${timeColor(q.mean_exec_time_ms)}`}>{q.mean_exec_time_ms?.toFixed(1)}ms</span></td>
                  <td className="px-4 py-3 text-right text-sm text-slate-400">{q.total_calls?.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-slate-400">{(q.total_exec_time_ms / 1000).toFixed(1)}s</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500">{q.last_seen_at ? new Date(q.last_seen_at).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3 text-right"><Badge variant={q.status}>{q.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  )
}
