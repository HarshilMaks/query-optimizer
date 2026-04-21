import type { Context } from '@netlify/functions'
import { getItem, setItem, listByPrefix, connKey, queryKey, suggestionKey } from './lib/storage.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, ctx: Context) => {
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const connectionId = url.searchParams.get('connection_id')
    const type = url.searchParams.get('type')

    let suggestions = await listByPrefix('suggestion/') as any[]
    if (status) suggestions = suggestions.filter(s => s.status === status)
    if (type) suggestions = suggestions.filter(s => s.suggestion_type === type)

    if (connectionId) {
      const queries = (await listByPrefix('query/')).filter((q: any) => q.connection_id === connectionId)
      const qIds = new Set(queries.map((q: any) => q.id))
      suggestions = suggestions.filter(s => qIds.has(s.query_id))
    }

    // Enrich with query preview and connection name
    const enriched = await Promise.all(suggestions.map(async (s) => {
      const q = await getItem<any>(queryKey(s.query_id))
      const conn = q ? await getItem<any>(connKey(q.connection_id)) : null
      return { ...s, query_preview: q?.query_text?.substring(0, 80) ?? '', database: conn?.name ?? 'Unknown' }
    }))

    return json(enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
  }

  if (req.method === 'PUT') {
    const url = new URL(req.url)
    const parts = url.pathname.split('/')
    const id = parts[parts.length - 1]
    const suggestion = await getItem<any>(suggestionKey(id))
    if (!suggestion) return json({ error: 'Not found' }, 404)
    const body = await req.json()
    const updated = { ...suggestion, ...body }
    await setItem(suggestionKey(id), updated)
    return json(updated)
  }

  return json({ error: 'Method not allowed' }, 405)
}

export const config = { path: '/api/suggestions' }
