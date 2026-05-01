import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { AppLayout, Badge } from '@/components/AppLayout'
import { Database, Bell, User, Trash2, Loader2, CheckCircle2, XCircle, Pencil, Save, X } from 'lucide-react'
import { getAccessToken } from '@/lib/auth-hooks'

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => {
    const token = getAccessToken()
    if (!token) {
      throw new Error('Unauthorized: Please log in')
    }
  },
  component: SettingsPage,
})

const TABS = [
  { id: 'connections', label: 'Connections', icon: Database },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'account', label: 'Account', icon: User },
]

function SettingsPage() {
  const [tab, setTab] = useState('connections')
  const [connections, setConnections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, any>>({})
  const [deleting, setDeleting] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState('')

  useEffect(() => {
    api.connections.list().then(setConnections).finally(() => setLoading(false))
  }, [])

  async function handleTest(id: string) {
    setTesting(id)
    try {
      const result = await api.connections.test(id)
      setTestResults(prev => ({ ...prev, [id]: result }))
      setConnections(prev => prev.map(c => c.id === id ? { ...c, status: result.success ? 'connected' : 'error' } : c))
    } finally {
      setTesting(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this connection? This cannot be undone.')) return
    setDeleting(id)
    try {
      await api.connections.delete(id)
      setConnections(prev => prev.filter(c => c.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  async function handleSaveEdit(id: string) {
    setErrorMsg('')
    try {
      const updated = await api.connections.update(id, editForm)
      setConnections(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c))
      setEditingId(null)
    } catch (err: any) {
      setErrorMsg(err.message)
    }
  }

  async function handleResetAll() {
    if (!confirm('Delete ALL platform data? This is permanent.')) return
    setResetting(true)
    setResetMsg('')
    try {
      const result = await api.admin.resetAll()
      setConnections([])
      setResetMsg(`Reset complete. Deleted ${result.deleted_items ?? 0} items.`)
    } catch (err: any) {
      setResetMsg(err.message)
    } finally {
      setResetting(false)
    }
  }

  return (
    <AppLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage your data sources and platform configuration</p>
        </div>

        <div className="flex gap-1 mb-6 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'connections' && (
          <div className="space-y-4">
            {loading ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500">Loading...</div>
            ) : connections.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
                <Database size={32} className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No connections configured.</p>
                <Link to="/connect" className="inline-flex mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">Add Connection</Link>
              </div>
            ) : connections.map(conn => (
              <div key={conn.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                {editingId === conn.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {[['name', 'Name'], ['host', 'Host'], ['database_name', 'Database'], ['username', 'Username']].map(([f, l]) => (
                        <div key={f}>
                          <label className="block text-xs text-slate-400 mb-1">{l}</label>
                          <input
                            value={editForm[f] ?? ''}
                            onChange={e => setEditForm((ef: any) => ({ ...ef, [f]: e.target.value }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">New Password (leave blank to keep current)</label>
                      <input
                        type="password"
                        value={editForm.password ?? ''}
                        onChange={e => setEditForm((ef: any) => ({ ...ef, password: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    {errorMsg && <div className="text-xs text-red-400">{errorMsg}</div>}
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveEdit(conn.id)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
                        <Save size={12} /> Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors">
                        <X size={12} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-semibold">{conn.name}</span>
                        <Badge variant={conn.status}>{conn.status}</Badge>
                        {testResults[conn.id] && (
                          testResults[conn.id].success
                            ? <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 size={11} /> Connected</span>
                            : <span className="text-xs text-red-400 flex items-center gap-1"><XCircle size={11} /> {testResults[conn.id].error}</span>
                        )}
                      </div>
                      <div className="font-mono text-xs text-slate-500">{conn.host}:{conn.port}/{conn.database_name} — user: {conn.username}</div>
                      {conn.last_tested_at && <div className="text-xs text-slate-600 mt-0.5">Last tested: {new Date(conn.last_tested_at).toLocaleString()}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleTest(conn.id)} disabled={testing === conn.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-50">
                        {testing === conn.id ? <Loader2 size={11} className="animate-spin" /> : null} Test
                      </button>
                      <button
                        onClick={() => { setEditingId(conn.id); setEditForm({ name: conn.name, host: conn.host, database_name: conn.database_name, username: conn.username }) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
                      >
                        <Pencil size={11} /> Edit
                      </button>
                      <button onClick={() => handleDelete(conn.id)} disabled={deleting === conn.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 text-xs rounded-lg transition-colors disabled:opacity-50">
                        {deleting === conn.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'notifications' && (
          <div className="max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="font-semibold mb-2">Alert Routing</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Guardrail alerts are generated from policy decisions and run status. Configure thresholds in <Link to="/guardrails" className="text-blue-400 hover:text-blue-300">Guardrails</Link> and monitor alerts through <Link to="/runs" className="text-blue-400 hover:text-blue-300">Runs</Link> and <Link to="/audit" className="text-blue-400 hover:text-blue-300">Audit</Link>.
            </p>
          </div>
        )}

        {tab === 'account' && (
          <div className="max-w-lg space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold">Model Configuration</h3>
              <p className="text-sm text-slate-400">Model access is configured through environment/provider integration. Recommendations are always policy-gated before actionability.</p>
            </div>

            <div className="bg-red-900/10 border border-red-800/50 rounded-xl p-5">
              <h3 className="font-semibold text-red-400 mb-2">Danger Zone</h3>
              <p className="text-sm text-slate-400 mb-4">Delete all platform data: connections, queries, analyses, suggestions, policies, approvals, runs, and audit events.</p>
              <button
                onClick={handleResetAll}
                disabled={resetting}
                className="flex items-center gap-2 px-4 py-2 bg-red-900/40 hover:bg-red-900/60 text-red-400 border border-red-700/50 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {resetting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete All Data
              </button>
              {resetMsg && <div className="text-xs mt-3 text-slate-300">{resetMsg}</div>}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
