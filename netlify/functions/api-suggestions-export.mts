import type { Context } from '@netlify/functions'
import { getItem, setItem, listByPrefix, suggestionKey, queryKey, connKey } from './lib/storage.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

function escapeCSV(v: unknown): string {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

export default async (req: Request, _ctx: Context) => {
  const suggestions = await listByPrefix('suggestion/') as any[]
  const enriched = await Promise.all(suggestions.map(async (s) => {
    const q = await getItem<any>(queryKey(s.query_id))
    const conn = q ? await getItem<any>(connKey(q.connection_id)) : null
    return { ...s, query_preview: q?.query_text?.substring(0, 80) ?? '', database: conn?.name ?? 'Unknown' }
  }))

  const headers = ['ID', 'Query Preview', 'Database', 'Type', 'Title', 'Status', 'Estimated Improvement %', 'Created At', 'Applied At']
  const rows = enriched.map(s => [s.id, s.query_preview, s.database, s.suggestion_type, s.title, s.status, s.estimated_improvement_pct, s.created_at, s.applied_at ?? ''].map(escapeCSV).join(','))
  const csv = [headers.join(','), ...rows].join('\n')

  return new Response(csv, {
    status: 200,
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="querysage-suggestions.csv"' },
  })
}

export const config = { path: '/api/suggestions/export' }
