import type { Context } from '@netlify/functions'
import { getItem, setItem, listByPrefix, connKey, queryKey } from './lib/storage.js'
import { getSlowQueries } from './lib/pg-client.js'
import type { Connection } from './api-connections.mjs'

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

export default async (req: Request, ctx: Context) => {
  const url = new URL(req.url)
  const connectionId = url.searchParams.get('connection_id')

  if (req.method === 'GET') {
    let queries = await listByPrefix('query/') as SlowQuery[]
    if (connectionId) queries = queries.filter(q => q.connection_id === connectionId)
    return json(queries.sort((a, b) => b.mean_exec_time_ms - a.mean_exec_time_ms))
  }

  // POST: refresh queries from pg_stat_statements
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}))
    const connId = body.connection_id ?? connectionId
    if (!connId) return json({ error: 'connection_id required' }, 400)

    const conn = await getItem<Connection>(connKey(connId))
    if (!conn) return json({ error: 'Connection not found' }, 404)

    const { queries, error, pgStatEnabled } = await getSlowQueries(conn as any)
    if (!pgStatEnabled) return json({ error: 'pg_stat_statements not enabled', pgStatEnabled: false }, 422)
    if (error) return json({ error }, 500)

    const existing = (await listByPrefix('query/') as SlowQuery[]).filter(q => q.connection_id === connId)
    const existingHashes = new Map(existing.map(q => [q.query_hash, q]))

    const saved: SlowQuery[] = []
    for (const q of queries) {
      const existing_q = existingHashes.get(q.query_hash)
      if (existing_q) {
        const updated: SlowQuery = { ...existing_q, mean_exec_time_ms: q.mean_exec_time_ms, total_calls: q.total_calls, total_exec_time_ms: q.total_exec_time_ms, last_seen_at: q.last_seen_at }
        await setItem(queryKey(existing_q.id), updated)
        saved.push(updated)
      } else {
        const id = crypto.randomUUID()
        const newQuery: SlowQuery = { id, connection_id: connId, query_hash: q.query_hash, query_text: q.query_text, mean_exec_time_ms: q.mean_exec_time_ms, total_calls: q.total_calls, total_exec_time_ms: q.total_exec_time_ms, stddev_exec_time: q.stddev_exec_time, min_exec_time: q.min_exec_time, max_exec_time: q.max_exec_time, last_seen_at: q.last_seen_at, status: 'pending', first_detected_at: new Date().toISOString() }
        await setItem(queryKey(id), newQuery)
        saved.push(newQuery)
      }
    }
    return json({ count: saved.length, queries: saved })
  }

  return json({ error: 'Method not allowed' }, 405)
}

export const config = { path: '/api/queries' }
