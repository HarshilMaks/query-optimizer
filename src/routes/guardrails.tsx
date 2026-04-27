import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AppLayout, Badge, Skeleton } from '@/components/AppLayout'
import { api } from '@/lib/api'
import { Loader2, ShieldCheck } from 'lucide-react'

export const Route = createFileRoute('/guardrails')({ component: GuardrailsPage })

function GuardrailsPage() {
  const [policies, setPolicies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [activating, setActivating] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const items = await api.policies.list()
      setPolicies(items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function createPolicy() {
    setCreating(true)
    try {
      await api.policies.create({
        name: `Policy ${new Date().toLocaleTimeString()}`,
        active: false,
      })
      await load()
    } finally {
      setCreating(false)
    }
  }

  async function activatePolicy(id: string) {
    setActivating(id)
    try {
      await api.policies.update(id, { active: true })
      await load()
    } finally {
      setActivating(null)
    }
  }

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Guardrails</h1>
            <p className="text-slate-400 text-sm mt-0.5">Policy controls for recommendation risk and approvals</p>
          </div>
          <button
            onClick={createPolicy}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            New Policy
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Policy</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Rules</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800/50">
                  <td colSpan={4} className="px-4 py-3"><Skeleton className="h-4" /></td>
                </tr>
              )) : policies.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{p.id}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    Min gain {p.rules?.min_improvement_pct}% · Approval risk {p.rules?.approval_risk_threshold}+ · Block risk {p.rules?.block_risk_threshold}+
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={p.active ? 'connected' : 'disconnected'}>
                      {p.active ? 'active' : 'inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!p.active && (
                      <button
                        onClick={() => activatePolicy(p.id)}
                        disabled={activating === p.id}
                        className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {activating === p.id ? 'Activating...' : 'Activate'}
                      </button>
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

