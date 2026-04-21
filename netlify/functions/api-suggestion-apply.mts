import type { Context } from '@netlify/functions'
import { getItem, setItem, suggestionKey, queryKey } from './lib/storage.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const { id } = ctx.params
  const suggestion = await getItem<any>(suggestionKey(id))
  if (!suggestion) return json({ error: 'Not found' }, 404)

  const updated = { ...suggestion, status: 'applied', applied_at: new Date().toISOString() }
  await setItem(suggestionKey(id), updated)

  // Update parent query status to optimized
  if (suggestion.query_id) {
    const query = await getItem<any>(queryKey(suggestion.query_id))
    if (query) await setItem(queryKey(suggestion.query_id), { ...query, status: 'optimized' })
  }

  return json({ success: true, suggestion: updated, modal: { title: 'Apply Index Manually', message: 'Copy this SQL and run it on your database or read replica. QuerySage does not execute SQL on your behalf for safety.', sql: suggestion.sql_to_run } })
}

export const config = { path: '/api/suggestions/:id/apply' }
