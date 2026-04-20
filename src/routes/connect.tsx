import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Link } from '@tanstack/react-router'
import { Zap, CheckCircle2, XCircle, Loader2, Database, Shield, Wifi } from 'lucide-react'
import { Badge } from '@/components/AppLayout'

export const Route = createFileRoute('/connect')({ component: ConnectPage })

interface ConnectionForm {
  name: string; host: string; port: string; database_name: string
  username: string; password: string; ssl_mode: 'prefer' | 'require' | 'disable'
}

const defaultForm: ConnectionForm = { name: '', host: '', port: '5432', database_name: '', username: '', password: '', ssl_mode: 'prefer' }

function ConnectPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<ConnectionForm>(defaultForm)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; pgStatEnabled?: boolean } | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [connections, setConnections] = useState<any[]>([])
  const [errors, setErrors] = useState<Partial<ConnectionForm>>({})

  useEffect(() => {
    api.connections.list().then(setConnections).catch(() => {})
  }, [])

  function validate(): boolean {
    const e: Partial<ConnectionForm> = {}
    if (!form.name) e.name = 'Required'
    if (!form.host) e.host = 'Required'
    if (!form.database_name) e.database_name = 'Required'
    if (!form.username) e.username = 'Required'
    if (!form.password) e.password = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleTest() {
    if (!validate()) return
    setTesting(true)
    setTestResult(null)
    try {
      // Save first to get an ID, then test
      const conn = await api.connections.create({ ...form, port: parseInt(form.port) })
      setSavedId(conn.id)
      const result = await api.connections.test(conn.id)
      setTestResult(result)
      setConnections(prev => [conn, ...prev.filter(c => c.id !== conn.id)])
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    try {
      let id = savedId
      if (!id) {
        const conn = await api.connections.create({ ...form, port: parseInt(form.port) })
        id = conn.id
      }
      navigate({ to: '/dashboard' })
    } catch (err) {
      setErrors({ name: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  function Field({ label, name, type = 'text', placeholder = '' }: { label: string; name: keyof ConnectionForm; type?: string; placeholder?: string }) {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
        <input
          type={type}
          value={form[name]}
          placeholder={placeholder}
          onChange={e => { setForm(f => ({ ...f, [name]: e.target.value })); setErrors(er => ({ ...er, [name]: undefined })) }}
          className={`w-full bg-slate-800 border rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${errors[name] ? 'border-red-500' : 'border-slate-700'}`}
        />
        {errors[name] && <p className="text-red-400 text-xs mt-1">{errors[name]}</p>}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center"><Zap size={14} className="text-white" /></div>
            <span className="font-bold">QuerySage</span>
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400 text-sm">Connect Database</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10 grid lg:grid-cols-2 gap-10">
        {/* Form */}
        <div>
          <h1 className="text-2xl font-bold mb-2">Add a PostgreSQL Connection</h1>
          <p className="text-slate-400 text-sm mb-8">Connect to any PostgreSQL database to start analyzing slow queries.</p>

          <div className="space-y-4">
            <Field label="Connection Name" name="name" placeholder="Production DB" />
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Field label="Host" name="host" placeholder="db.example.com" /></div>
              <Field label="Port" name="port" placeholder="5432" />
            </div>
            <Field label="Database Name" name="database_name" placeholder="myapp" />
            <Field label="Username" name="username" placeholder="postgres" />
            <Field label="Password" name="password" type="password" placeholder="••••••••" />

            {/* SSL Mode */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">SSL Mode</label>
              <div className="flex gap-2">
                {(['prefer', 'require', 'disable'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setForm(f => ({ ...f, ssl_mode: mode }))}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${form.ssl_mode === mode ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Security note */}
            <div className="flex items-start gap-2 p-3 bg-slate-800/60 border border-slate-700 rounded-lg">
              <Shield size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-400">Your credentials are encrypted at rest with AES-256-GCM. QuerySage never logs raw passwords.</p>
            </div>

            {/* Test result */}
            {testResult && (
              <div className={`flex items-start gap-2 p-3 rounded-lg border ${testResult.success ? 'bg-emerald-900/20 border-emerald-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
                {testResult.success ? <CheckCircle2 size={16} className="text-emerald-400 mt-0.5" /> : <XCircle size={16} className="text-red-400 mt-0.5" />}
                <div>
                  <p className={`text-sm font-medium ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {testResult.success ? 'Connection successful!' : 'Connection failed'}
                  </p>
                  {testResult.success && testResult.pgStatEnabled === false && (
                    <p className="text-xs text-amber-400 mt-1">⚠️ pg_stat_statements not enabled. Run: <code className="font-mono">CREATE EXTENSION pg_stat_statements;</code></p>
                  )}
                  {testResult.error && <p className="text-xs text-red-300 mt-1">{testResult.error}</p>}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleTest}
                disabled={testing || saving}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {testing ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                Test Connection
              </button>
              <button
                onClick={handleSave}
                disabled={testing || saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save & Go to Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Existing connections */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-slate-300">Existing Connections</h2>
          {connections.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
              <Database size={32} className="text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No connections yet. Add your first database above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map(conn => (
                <div key={conn.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white text-sm">{conn.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{conn.host}:{conn.port}/{conn.database_name}</div>
                  </div>
                  <Badge variant={conn.status as any}>{conn.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
