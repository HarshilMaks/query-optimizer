import type { Context } from '@netlify/functions'
import { appendAuditEvent } from './lib/audit.js'
import { deleteItem, listKeysByPrefix } from './lib/storage.js'
import { getRequestContext } from './lib/request-context.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

const PREFIXES = ['conn/', 'query/', 'explain/', 'analysis/', 'suggestion/', 'policy/', 'approval/', 'audit/', 'run/', 'digest-settings']

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const { tenantId, actorId } = getRequestContext(req)
  const body = await req.json().catch(() => ({}))
  if (body.confirm !== 'DELETE_ALL') {
    return json({ error: 'Confirmation token required' }, 400)
  }

  let deleted = 0
  for (const prefix of PREFIXES) {
    const keys = prefix === 'digest-settings'
      ? ['digest-settings']
      : await listKeysByPrefix(prefix)
    for (const key of keys) {
      await deleteItem(key)
      deleted += 1
    }
  }

  await appendAuditEvent({
    tenant_id: tenantId,
    entity_type: 'admin',
    entity_id: 'reset',
    action: 'admin.reset_all',
    actor_id: actorId,
    reason: 'All platform data reset by admin',
    metadata: { deleted_items: deleted },
  })

  return json({ success: true, deleted_items: deleted })
}

export const config = { path: '/api/admin/reset' }
