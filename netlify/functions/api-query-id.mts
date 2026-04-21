import type { Context } from '@netlify/functions'
import { getItem, setItem, listByPrefix, queryKey, connKey, explainKey, analysisKey, suggestionKey } from './lib/storage.js'
import type { SlowQuery } from './api-queries.mjs'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, ctx: Context) => {
  const { id } = ctx.params
  const query = await getItem<SlowQuery>(queryKey(id))
  if (!query) return json({ error: 'Query not found' }, 404)

  if (req.method === 'GET') {
    const explains = (await listByPrefix('explain/')).filter((e: any) => e.query_id === id)
    const analyses = (await listByPrefix('analysis/')).filter((a: any) => a.query_id === id)
    const suggestions = (await listByPrefix('suggestion/')).filter((s: any) => s.query_id === id)
    const conn = await getItem<any>(connKey(query.connection_id))
    return json({ query, explains, analyses, suggestions, connection_name: conn?.name ?? 'Unknown' })
  }

  return json({ error: 'Method not allowed' }, 405)
}

export const config = { path: '/api/queries/:id' }
