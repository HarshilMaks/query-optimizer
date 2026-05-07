import type { Context } from '@netlify/functions'
import { getItem, setItem, connKey } from './lib/storage.js'
import { appendAuditEvent } from './lib/audit.js'
import { testConnection } from './lib/pg-client.js'
import { getRequestContext } from './lib/request-context.js'
import { requireAuth, requireRole } from './lib/rbac.js'
import type { Connection } from './api-connections.mjs'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const claims = requireAuth(req)
    requireRole(claims, 'admin')
  } catch (error) {
    return json({ error: 'Unauthorized: Admin role required' }, 401)
  }

  const { tenantId, actorId } = getRequestContext(req)
  const { id } = ctx.params
  const conn = await getItem<Connection>(connKey(id))
  if (!conn) return json({ error: 'Connection not found' }, 404)

  const result = await testConnection(conn as any)
  const status = result.success ? 'connected' : 'error'
  const updated: Connection = { ...conn, status, last_tested_at: new Date().toISOString() }
  await setItem(connKey(id), updated)
  await appendAuditEvent({
    tenant_id: tenantId,
    actor_id: actorId,
    entity_type: 'connection',
    entity_id: id,
    action: 'connection.validated',
    reason: 'Database connection validation executed',
    metadata: { success: result.success, status, pgStatEnabled: result.pgStatEnabled, error: result.error ?? null },
  })

  return json({ success: result.success, error: result.error, pgStatEnabled: result.pgStatEnabled, status })
}

export const config = { path: '/api/connections/:id/test' }
