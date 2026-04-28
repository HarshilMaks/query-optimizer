import { connKey, listByPrefix, queryKey, getItem, setItem } from './storage.js'
import { getSlowQueries } from './pg-client.js'
import type { Connection } from '../api-connections.mjs'
import type { SlowQuery } from '../api-queries.mjs'

export async function refreshConnectionQueries(connId: string): Promise<{ saved: SlowQuery[]; pgStatEnabled: boolean; error: string | null; connection?: Connection }> {
  const conn = await getItem<Connection>(connKey(connId))
  if (!conn) return { saved: [], pgStatEnabled: false, error: 'Connection not found' }

  const { queries, error, pgStatEnabled } = await getSlowQueries(conn as any)
  if (!pgStatEnabled) return { saved: [], pgStatEnabled: false, error: null, connection: conn }
  if (error) return { saved: [], pgStatEnabled: true, error, connection: conn }

  const existing = (await listByPrefix('query/') as SlowQuery[]).filter((q) => q.connection_id === connId)
  const existingHashes = new Map(existing.map((q) => [q.query_hash, q]))

  const saved: SlowQuery[] = []
  for (const q of queries) {
    const existingQuery = existingHashes.get(q.query_hash)
    if (existingQuery) {
      const updated: SlowQuery = {
        ...existingQuery,
        mean_exec_time_ms: q.mean_exec_time_ms,
        total_calls: q.total_calls,
        total_exec_time_ms: q.total_exec_time_ms,
        stddev_exec_time: q.stddev_exec_time,
        min_exec_time: q.min_exec_time,
        max_exec_time: q.max_exec_time,
        last_seen_at: q.last_seen_at,
      }
      await setItem(queryKey(existingQuery.id), updated)
      saved.push(updated)
    } else {
      const id = crypto.randomUUID()
      const newQuery: SlowQuery = {
        id,
        connection_id: connId,
        query_hash: q.query_hash,
        query_text: q.query_text,
        mean_exec_time_ms: q.mean_exec_time_ms,
        total_calls: q.total_calls,
        total_exec_time_ms: q.total_exec_time_ms,
        stddev_exec_time: q.stddev_exec_time,
        min_exec_time: q.min_exec_time,
        max_exec_time: q.max_exec_time,
        last_seen_at: q.last_seen_at,
        status: 'pending',
        first_detected_at: new Date().toISOString(),
      }
      await setItem(queryKey(id), newQuery)
      saved.push(newQuery)
    }
  }

  return { saved, pgStatEnabled: true, error: null, connection: conn }
}
