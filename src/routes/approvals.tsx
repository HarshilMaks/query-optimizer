import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AppLayout, Badge, Skeleton } from '@/components/AppLayout'
import { api } from '@/lib/api'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

export const Route = createFileRoute('/approvals')({ component: ApprovalsPage })

function ApprovalsPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const rows = await api.approvals.list()
      setItems(rows)
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
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Recommendation</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Risk / Confidence</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Reason</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800/50"><td colSpan={5} className="px-4 py-3"><Skeleton className="h-4" /></td></tr>
              )) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-16 text-center text-slate-500">No approvals pending.</td></tr>
              ) : items.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/50">
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-200">{a.recommendation?.title ?? a.recommendation_id}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{a.recommendation?.suggestion_type ?? 'unknown'}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    Risk {a.risk_score ?? a.recommendation?.risk_score ?? '—'} · Confidence {a.confidence_score ?? a.recommendation?.confidence_score ?? '—'}
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  )
}

