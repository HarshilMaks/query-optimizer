import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AppLayout, Badge, Skeleton } from '@/components/AppLayout'
import { ValidationResult } from '@/components/ValidationResult'
import { api } from '@/lib/api'
import { CheckCircle2, Loader2, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { getAccessToken } from '@/lib/auth-hooks'

export const Route = createFileRoute('/approvals')({
  beforeLoad: async () => {
    const token = getAccessToken()
    if (!token) {
      throw new Error('Unauthorized: Please log in')
    }
  },
  component: ApprovalsPage,
})

function ApprovalsPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [validations, setValidations] = useState<Record<string, any>>({})

  async function load() {
    setLoading(true)
    try {
      const rows = await api.approvals.list()
      setItems(rows)
      
      // Fetch validation metrics for each approval if available
      const validationMap: Record<string, any> = {}
      for (const approval of rows) {
        if (approval.recommendation_id) {
          try {
            const vals = await api.validation.list(approval.recommendation_id, 1)
            if (vals && vals.length > 0) {
              validationMap[approval.id] = vals[0]
            }
          } catch (err) {
            // Validation may not exist yet, that's ok
          }
        }
      }
      setValidations(validationMap)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusy(id + decision)
    try {
      if (decision === 'approve') await api.approvals.approve(id, 'Approved via approval board')
      else await api.approvals.reject(id, 'Rejected via approval board')
      await load()
    } finally {
      setBusy(null)
    }
  }

  function toggleRow(id: string) {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  return (
    <AppLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Approvals</h1>
          <p className="text-slate-400 text-sm mt-0.5">Review high-risk recommendations before rollout</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider w-12"></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Recommendation</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Risk / Confidence</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Reason</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800/50"><td colSpan={6} className="px-4 py-3"><Skeleton className="h-4" /></td></tr>
              )) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-16 text-center text-slate-500">No approvals pending.</td></tr>
              ) : items.map((a) => (
                <tbody key={a.id}>
                  <tr className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-center">
                      {validations[a.id] && (
                        <button
                          onClick={() => toggleRow(a.id)}
                          className="p-1 hover:bg-slate-700 rounded transition-colors"
                          title={expandedRows.has(a.id) ? 'Hide metrics' : 'Show validation metrics'}
                        >
                          {expandedRows.has(a.id) ? 
                            <ChevronUp size={16} className="text-slate-400" /> : 
                            <ChevronDown size={16} className="text-slate-400" />
                          }
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-200">{a.recommendation?.title ?? a.recommendation_id}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{a.recommendation?.suggestion_type ?? 'unknown'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      <div>Risk {a.risk_score ?? a.recommendation?.risk_score ?? '—'}</div>
                      {validations[a.id]?.comparison?.confidence && (
                        <div className="mt-1">
                          <Badge variant={validations[a.id].comparison.confidence === 'high' ? 'validated' : validations[a.id].comparison.confidence === 'medium' ? 'running' : 'pending'}>
                            {validations[a.id].comparison.confidence} ({validations[a.id].comparison.confidenceScore}%)
                          </Badge>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{a.reason ?? a.decision_reason ?? '—'}</td>
                    <td className="px-4 py-3 text-right"><Badge variant={a.status === 'approved' ? 'applied' : a.status === 'rejected' ? 'dismissed' : 'pending'}>{a.status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      {a.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => decide(a.id, 'approve')}
                            disabled={busy === a.id + 'approve'}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
                          >
                            {busy === a.id + 'approve' ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                            Approve
                          </button>
                          <button
                            onClick={() => decide(a.id, 'reject')}
                            disabled={busy === a.id + 'reject'}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-red-800 hover:bg-red-700 disabled:opacity-50"
                          >
                            {busy === a.id + 'reject' ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {expandedRows.has(a.id) && validations[a.id] && (
                    <tr className="border-b border-slate-800/50 bg-slate-950/50">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="mb-2">
                          <div className="text-xs font-medium text-slate-400 mb-2">Validation Metrics</div>
                          <ValidationResult 
                            validation={validations[a.id]}
                            loading={false}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  )
}

