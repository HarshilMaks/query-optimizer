import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { AppLayout, Badge, Skeleton } from '@/components/AppLayout'
import { Download, Loader2, CheckCircle2, XCircle } from 'lucide-react'

export const Route = createFileRoute('/suggestions')({ component: SuggestionsPage })

function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [applying, setApplying] = useState<string | null>(null)
  const [applyModal, setApplyModal] = useState<any | null>(null)
  const [dismissing, setDismissing] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await api.suggestions.list({ status: filterStatus || undefined, type: filterType || undefined })
      setSuggestions(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterStatus, filterType])

  async function handleApply(id: string) {
    setApplying(id)
    try {
      const result = await api.suggestions.apply(id)
      setApplyModal(result.modal ? { ...result.modal, sql: result.suggestion.sql_to_run } : null)
      setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: 'applied', applied_at: new Date().toISOString() } : s))
    } finally {
      setApplying(null)
    }
  }

  async function handleDismiss(id: string) {
    setDismissing(id)
    try {
      await api.suggestions.update(id, { status: 'dismissed' })
      setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: 'dismissed' } : s))
    } finally {
      setDismissing(null)
    }
  }

  const filtered = suggestions.filter(s => {
    if (filterStatus && s.status !== filterStatus) return false
    if (filterType && s.suggestion_type !== filterType) return false
    return true
  })

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Suggestions</h1>
            <p className="text-slate-400 text-sm mt-0.5">All AI-generated optimization suggestions</p>
          </div>
          <a href={api.suggestions.exportUrl()} download className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-white rounded-lg transition-colors">
            <Download size={14} /> Export CSV
          </a>
        </div>

        <div className="flex gap-3 mb-4">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="applied">Applied</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none">
            <option value="">All types</option>
            <option value="index">Index</option>
            <option value="rewrite">Query Rewrite</option>
            <option value="config">Config</option>
          </select>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Query</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider text-left">Database</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider text-left">Type</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider text-left">Title</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider text-right">Est. Gain</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider text-right">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800/50"><td colSpan={7} className="px-4 py-3"><Skeleton className="h-4" /></td></tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center">
                  <CheckCircle2 size={32} className="text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No suggestions found. Analyze some slow queries to generate recommendations.</p>
                </td></tr>
              ) : filtered.map(s => (
                <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <a href={`/query/${s.query_id}`} className="font-mono text-xs text-slate-300 hover:text-blue-400 truncate max-w-xs block transition-colors" title={s.query_preview}>
                      {s.query_preview || '—'}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{s.database}</td>
                  <td className="px-4 py-3"><Badge variant={s.suggestion_type}>{s.suggestion_type}</Badge></td>
                  <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate">{s.title}</td>
                  <td className="px-4 py-3 text-right">
                    {s.estimated_improvement_pct ? (
                      <span className="text-emerald-400 font-semibold text-sm">+{s.estimated_improvement_pct}%</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right"><Badge variant={s.status}>{s.status}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    {s.status === 'pending' && (
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => handleApply(s.id)} disabled={applying === s.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded-lg transition-colors disabled:opacity-50">
                          {applying === s.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Apply
                        </button>
                        <button onClick={() => handleDismiss(s.id)} disabled={dismissing === s.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-50">
                          {dismissing === s.id ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />} Dismiss
                        </button>
                      </div>
                    )}
                    {s.status === 'applied' && <span className="text-xs text-slate-500">{s.applied_at ? new Date(s.applied_at).toLocaleDateString() : 'Applied'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Apply modal */}
        {applyModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full">
              <h3 className="text-lg font-bold mb-2">{applyModal.title}</h3>
              <p className="text-slate-400 text-sm mb-4">{applyModal.message}</p>
              <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap mb-4">{applyModal.sql}</pre>
              <div className="flex gap-3">
                <button onClick={() => { navigator.clipboard.writeText(applyModal.sql) }} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                  Copy SQL
                </button>
                <button onClick={() => setApplyModal(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
