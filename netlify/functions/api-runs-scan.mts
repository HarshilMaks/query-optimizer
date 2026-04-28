import type { Context } from '@netlify/functions'
import { appendAuditEvent } from './lib/audit.js'
import { listByPrefix, runKey, setItem } from './lib/storage.js'
import { refreshConnectionQueries } from './lib/query-ingest.js'
import { getRequestContext } from './lib/request-context.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const { tenantId, actorId } = getRequestContext(req)
  const body = await req.json().catch(() => ({}))
  const requestedConnectionId = body.connection_id as string | undefined

  const runId = crypto.randomUUID()
  const startedAt = new Date().toISOString()

  const run = {
    id: runId,
    tenant_id: tenantId,
    type: 'scan',
    status: 'running',
    started_at: startedAt,
    started_by: actorId,
    summary: null as any,
  }
  await setItem(runKey(runId), run)

  await appendAuditEvent({
    tenant_id: tenantId,
    entity_type: 'run',
    entity_id: runId,
    action: 'run.scan.started',
    actor_id: actorId,
    reason: 'Scan run started',
  })

  const connections = (await listByPrefix('conn/')) as any[]
  const targets = requestedConnectionId
    ? connections.filter((c) => c.id === requestedConnectionId)
    : connections

  if (requestedConnectionId && targets.length === 0) {
    await setItem(runKey(runId), {
      ...run,
      status: 'failed',
      finished_at: new Date().toISOString(),
      summary: { error: 'Connection not found' },
    })
    return json({ error: 'Connection not found' }, 404)
  }

  const perConnection: Array<Record<string, unknown>> = []
  let totalSaved = 0
  let failures = 0

  for (const conn of targets) {
    const result = await refreshConnectionQueries(conn.id)
    const row = {
      connection_id: conn.id,
      connection_name: conn.name,
      count: result.saved.length,
      pgStatEnabled: result.pgStatEnabled,
      error: result.error,
    }
    perConnection.push(row)
    totalSaved += result.saved.length
    if (result.error || !result.pgStatEnabled) failures += 1
  }

  const finishedAt = new Date().toISOString()
  const summary = {
    scanned_connections: targets.length,
    total_saved_queries: totalSaved,
    failures,
    per_connection: perConnection,
  }

  const finalStatus = failures === targets.length ? 'failed' : failures > 0 ? 'partial' : 'succeeded'

  await setItem(runKey(runId), {
    ...run,
    status: finalStatus,
    finished_at: finishedAt,
    summary,
  })

  await appendAuditEvent({
    tenant_id: tenantId,
    entity_type: 'run',
    entity_id: runId,
    action: 'run.scan.completed',
    actor_id: actorId,
    reason: 'Scan run completed',
    metadata: { status: finalStatus, scanned_connections: targets.length, total_saved_queries: totalSaved, failures },
  })

  return json({ id: runId, status: finalStatus, summary })
}

export const config = { path: '/api/runs/scan' }
