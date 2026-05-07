import type { Context } from '@netlify/functions'
import { getItem, setItem, deleteItem, connKey } from './lib/storage.js'
import { encrypt } from './lib/crypto.js'
import { appendAuditEvent } from './lib/audit.js'
import { getRequestContext } from './lib/request-context.js'
import { requireAuth, requireRole } from './lib/rbac.js'
import type { Connection } from './api-connections.mjs'

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } })
}

export default async (req: Request, ctx: Context) => {
  const { tenantId, actorId } = getRequestContext(req)
  const { id } = ctx.params
  const conn = await getItem<Connection>(connKey(id))

  if (req.method === 'GET') {
    try {
      requireAuth(req)
    } catch (error) {
      return json({ error: 'Unauthorized' }, 401)
    }
    if (!conn) return json({ error: 'Not found' }, 404)
    return json({ ...conn, password_encrypted: '[hidden]' })
  }

  if (req.method === 'PUT') {
    try {
      const claims = requireAuth(req)
      requireRole(claims, 'admin')
    } catch (error) {
      return json({ error: 'Unauthorized: Admin role required' }, 401)
    }
    if (!conn) return json({ error: 'Not found' }, 404)
    const body = await req.json()
    const updated: Connection = {
      ...conn,
      name: body.name ?? conn.name,
      host: body.host ?? conn.host,
      port: body.port ?? conn.port,
      database_name: body.database_name ?? conn.database_name,
      username: body.username ?? conn.username,
      ssl_mode: body.ssl_mode ?? conn.ssl_mode,
      password_encrypted: body.password ? encrypt(body.password) : conn.password_encrypted,
    }
    await setItem(connKey(id), updated)
    await appendAuditEvent({
      tenant_id: tenantId,
      actor_id: actorId,
      entity_type: 'connection',
      entity_id: id,
      action: 'connection.updated',
      reason: 'Database connection updated',
      metadata: { changed_fields: Object.keys(body ?? {}) },
    })
    return json({ ...updated, password_encrypted: '[hidden]' })
  }

  if (req.method === 'DELETE') {
    try {
      const claims = requireAuth(req)
      requireRole(claims, 'admin')
    } catch (error) {
      return json({ error: 'Unauthorized: Admin role required' }, 401)
    }
    if (!conn) return json({ error: 'Not found' }, 404)
    await deleteItem(connKey(id))
    await appendAuditEvent({
      tenant_id: tenantId,
      actor_id: actorId,
      entity_type: 'connection',
      entity_id: id,
      action: 'connection.deleted',
      reason: 'Database connection deleted',
      metadata: { name: conn.name, host: conn.host, database_name: conn.database_name },
    })
    return json({ deleted: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}

export const config = { path: '/api/connections/:id' }
