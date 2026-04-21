import type { Context } from '@netlify/functions'
import { getItem, setItem, listByPrefix } from './lib/storage.js'
import { Resend } from 'resend'

const DIGEST_SETTINGS_KEY = 'digest-settings'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

async function buildDigestData() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const queries = (await listByPrefix('query/') as any[]).sort((a, b) => b.mean_exec_time_ms - a.mean_exec_time_ms)
  const suggestions = await listByPrefix('suggestion/') as any[]
  const appliedThisWeek = suggestions.filter(s => s.applied_at && s.applied_at > oneWeekAgo)
  const newThisWeek = queries.filter(q => q.first_detected_at > oneWeekAgo)
  return { topSlowQueries: queries.slice(0, 5), appliedOptimizations: appliedThisWeek, newQueriesDetected: newThisWeek.length, totalQueries: queries.length }
}

function buildEmailHtml(data: Awaited<ReturnType<typeof buildDigestData>>) {
  const rows = data.topSlowQueries.map(q => `<tr><td style="padding:8px;border-bottom:1px solid #334155;font-family:monospace;font-size:12px">${q.query_text?.substring(0, 60) ?? ''}...</td><td style="padding:8px;border-bottom:1px solid #334155;text-align:right;color:#f59e0b">${q.mean_exec_time_ms?.toFixed(1) ?? 0}ms</td></tr>`).join('')
  return `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:Inter,sans-serif;padding:24px"><div style="max-width:600px;margin:0 auto"><h1 style="color:#3b82f6;font-size:24px">QuerySage Weekly Digest</h1><p style="color:#94a3b8">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p><div style="display:flex;gap:16px;margin:24px 0"><div style="background:#1e293b;padding:16px;border-radius:8px;flex:1;text-align:center"><div style="font-size:32px;font-weight:700;color:#ef4444">${data.totalQueries}</div><div style="font-size:12px;color:#94a3b8">Slow Queries</div></div><div style="background:#1e293b;padding:16px;border-radius:8px;flex:1;text-align:center"><div style="font-size:32px;font-weight:700;color:#10b981">${data.appliedOptimizations.length}</div><div style="font-size:12px;color:#94a3b8">Optimizations Applied</div></div><div style="background:#1e293b;padding:16px;border-radius:8px;flex:1;text-align:center"><div style="font-size:32px;font-weight:700;color:#3b82f6">${data.newQueriesDetected}</div><div style="font-size:12px;color:#94a3b8">New This Week</div></div></div><h2 style="color:#e2e8f0;font-size:18px">Top 5 Slowest Queries</h2><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:8px;color:#94a3b8;font-size:12px">Query</th><th style="text-align:right;padding:8px;color:#94a3b8;font-size:12px">Mean Time</th></tr></thead><tbody>${rows}</tbody></table><div style="margin-top:24px;padding-top:24px;border-top:1px solid #334155;color:#64748b;font-size:12px">Sent by QuerySage · <a href="#" style="color:#3b82f6">Unsubscribe</a></div></div></body></html>`
}

export default async (req: Request, _ctx: Context) => {
  const url = new URL(req.url)
  const action = url.pathname.split('/').pop()

  // GET /api/digest or /api/digest/preview
  if (req.method === 'GET') {
    const settings = (await getItem(DIGEST_SETTINGS_KEY)) ?? { recipient_email: '', enabled: false, day: 'monday', hour: 9 }
    const data = await buildDigestData()
    return json({ settings, data })
  }

  // PUT /api/digest/settings
  if (req.method === 'PUT') {
    const body = await req.json()
    const current = (await getItem(DIGEST_SETTINGS_KEY)) ?? {}
    await setItem(DIGEST_SETTINGS_KEY, { ...(current as object), ...body, updated_at: new Date().toISOString() })
    return json({ success: true })
  }

  // POST /api/digest/send
  if (req.method === 'POST') {
    const settings = await getItem<any>(DIGEST_SETTINGS_KEY)
    const body = await req.json().catch(() => ({}))
    const recipient = body.recipient_email ?? settings?.recipient_email
    if (!recipient) return json({ error: 'No recipient email configured' }, 400)

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return json({ error: 'RESEND_API_KEY not configured' }, 500)

    const data = await buildDigestData()
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: 'QuerySage <digest@updates.querysage.dev>',
      to: recipient,
      subject: `QuerySage Weekly Digest — ${data.totalQueries} slow queries detected`,
      html: buildEmailHtml(data),
    })

    if (error) return json({ error: error.message }, 500)
    return json({ success: true, recipient })
  }

  return json({ error: 'Method not allowed' }, 405)
}

export const config = { path: ['/api/digest', '/api/digest/:action'] }
