import type { Context } from '@netlify/functions'
import { listByPrefix } from './lib/storage.js'
import { refreshConnectionQueries } from './lib/query-ingest.js'
import { requireAuth, requireRole } from './lib/rbac.js'

export interface SlowQuery {
  id: string; connection_id: string; query_hash: string; query_text: string
  mean_exec_time_ms: number; total_calls: number; total_exec_time_ms: number
  stddev_exec_time: number; min_exec_time: number; max_exec_time: number
  last_seen_at: string; status: 'pending' | 'analyzed' | 'optimized'; first_detected_at: string
  connection_name?: string
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, _ctx: Context) => {
  const url = new URL(req.url)
  const connectionId = url.searchParams.get('connection_id')

  if (req.method === 'GET') {
    try {
      requireAuth(req)
    } catch (error) {
      return json({ error: 'Unauthorized' }, 401)
    }

    let queries = await listByPrefix('query/') as SlowQuery[]
    if (connectionId) queries = queries.filter(q => q.connection_id === connectionId)
    return json(queries.sort((a, b) => b.mean_exec_time_ms - a.mean_exec_time_ms))
  }

  if (req.method === 'POST') {
    try {
      const claims = requireAuth(req)
      requireRole(claims, 'admin')
    } catch (error) {
      return json({ error: 'Unauthorized: Admin role required' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const connId = body.connection_id ?? connectionId
    if (!connId) return json({ error: 'connection_id required' }, 400)

    const { saved, error, pgStatEnabled } = await refreshConnectionQueries(connId)
    if (!pgStatEnabled) return json({ error: 'pg_stat_statements not enabled', pgStatEnabled: false }, 422)
    if (error) return json({ error }, 500)

    return json({ count: saved.length, queries: saved, pgStatEnabled: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}

export const config = { path: '/api/queries' }
