import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AppLayout, Skeleton } from '@/components/AppLayout'
import { api } from '@/lib/api'
import { getAccessToken } from '@/lib/auth-hooks'

export const Route = createFileRoute('/audit')({
  beforeLoad: async () => {
    const token = getAccessToken()
    if (!token) {
      throw new Error('Unauthorized: Please log in')
    }
  },
  component: AuditPage,
})

function AuditPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const rows = await api.audit.listEvents(200)
      setEvents(rows)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <AppLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Audit Trail</h1>
          <p className="text-slate-400 text-sm mt-0.5">Immutable events for recommendations, approvals, and policy decisions</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Timestamp</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Entity</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800/50"><td colSpan={5} className="px-4 py-3"><Skeleton className="h-4" /></td></tr>
              )) : events.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-16 text-center text-slate-500">No audit events yet.</td></tr>
              ) : events.map((e) => (
                <tr key={e.id} className="border-b border-slate-800/50">
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-slate-200 font-medium">{e.action}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{e.entity_type}:{e.entity_id?.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{e.actor_id}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{e.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  )
}

