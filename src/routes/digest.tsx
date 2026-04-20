import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { AppLayout, Skeleton } from '@/components/AppLayout'
import { Mail, Send, Eye, Loader2, CheckCircle2, ToggleLeft, ToggleRight, Clock } from 'lucide-react'

export const Route = createFileRoute('/digest')({ component: DigestPage })

function DigestPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [settings, setSettings] = useState({ recipient_email: '', enabled: false, day: 'monday', hour: 9 })
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    api.digest.get().then(res => {
      setData(res.data)
      if (res.settings) setSettings(s => ({ ...s, ...res.settings }))
      if (res.settings?.recipient_email) setTestEmail(res.settings.recipient_email)
    }).finally(() => setLoading(false))
  }, [])

  async function handleSaveSettings() {
    setSaving(true)
    try {
      await api.digest.updateSettings(settings)
      setSaveMsg('Settings saved!')
      setTimeout(() => setSaveMsg(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  async function handleSendTest() {
    if (!testEmail) return
    setSending(true)
    setSent(false)
    try {
      await api.digest.send(testEmail)
      setSent(true)
      setTimeout(() => setSent(false), 4000)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSending(false)
    }
  }

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

  return (
    <AppLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Weekly Digest</h1>
          <p className="text-slate-400 text-sm mt-0.5">Preview and configure your weekly optimization summary email</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Preview */}
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Eye size={16} className="text-blue-400" /> Digest Preview
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              {/* Email header */}
              <div className="bg-slate-800 px-5 py-4 border-b border-slate-700">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center"><Mail size={12} className="text-white" /></div>
                  <span className="font-bold text-sm">QuerySage Weekly Digest</span>
                </div>
                <div className="text-xs text-slate-500">digest@updates.querysage.dev → {settings.recipient_email || 'your@email.com'}</div>
              </div>

              <div className="p-5">
                {loading ? (
                  <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5" />)}</div>
                ) : (
                  <>
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      {[
                        { label: 'Slow Queries', value: data?.totalQueries ?? 0, color: 'text-red-400' },
                        { label: 'Optimizations', value: data?.appliedOptimizations?.length ?? 0, color: 'text-emerald-400' },
                        { label: 'New This Week', value: data?.newQueriesDetected ?? 0, color: 'text-blue-400' },
                      ].map(stat => (
                        <div key={stat.label} className="bg-slate-800 rounded-lg p-3 text-center">
                          <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Top slow queries */}
                    <h3 className="text-sm font-semibold text-slate-300 mb-2">Top 5 Slowest Queries</h3>
                    {data?.topSlowQueries?.length > 0 ? (
                      <div className="space-y-2">
                        {data.topSlowQueries.map((q: any, i: number) => (
                          <div key={q.id ?? i} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2 gap-3">
                            <span className="font-mono text-xs text-slate-300 truncate">{q.query_text?.substring(0, 50) ?? '—'}...</span>
                            <span className={`text-xs font-semibold flex-shrink-0 ${q.mean_exec_time_ms >= 1000 ? 'text-red-400' : q.mean_exec_time_ms >= 200 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {q.mean_exec_time_ms?.toFixed(0)}ms
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-slate-500 text-sm">
                        <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-2" />
                        No slow queries this week!
                      </div>
                    )}

                    {/* Applied optimizations */}
                    {(data?.appliedOptimizations?.length ?? 0) > 0 && (
                      <>
                        <h3 className="text-sm font-semibold text-slate-300 mt-4 mb-2">Applied Optimizations</h3>
                        <div className="space-y-2">
                          {data.appliedOptimizations.map((s: any) => (
                            <div key={s.id} className="flex items-start gap-2 bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-3 py-2">
                              <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                              <span className="text-xs text-slate-300">{s.title}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Config */}
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock size={16} className="text-blue-400" /> Email Configuration
            </h2>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Automatic Weekly Digest</div>
                  <div className="text-xs text-slate-500 mt-0.5">Send digest email automatically each week</div>
                </div>
                <button onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))} className="text-slate-400 hover:text-white transition-colors">
                  {settings.enabled ? <ToggleRight size={28} className="text-blue-500" /> : <ToggleLeft size={28} />}
                </button>
              </div>

              {/* Recipient email */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Recipient Email</label>
                <input
                  type="email"
                  value={settings.recipient_email}
                  onChange={e => setSettings(s => ({ ...s, recipient_email: e.target.value }))}
                  placeholder="you@example.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Day */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Send Day</label>
                <div className="grid grid-cols-7 gap-1">
                  {days.map(day => (
                    <button key={day} onClick={() => setSettings(s => ({ ...s, day }))}
                      className={`py-1.5 rounded text-xs capitalize font-medium transition-colors ${settings.day === day ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hour */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Send Time (UTC)</label>
                <select value={settings.hour} onChange={e => setSettings(s => ({ ...s, hour: parseInt(e.target.value) }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none">
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, '0')}:00 UTC</option>
                  ))}
                </select>
              </div>

              <button onClick={handleSaveSettings} disabled={saving} className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saveMsg || 'Save Settings'}
              </button>

              <div className="border-t border-slate-800 pt-4">
                <div className="text-sm font-medium mb-2">Send Test Email</div>
                <div className="flex gap-2">
                  <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@example.com"
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <button onClick={handleSendTest} disabled={sending || !testEmail} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    {sending ? <Loader2 size={14} className="animate-spin" /> : sent ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Send size={14} />}
                    {sent ? 'Sent!' : 'Send'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">Requires RESEND_API_KEY environment variable.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
