import type { Context } from '@netlify/functions'
import { getItem, listByPrefix, policyKey, setItem } from './lib/storage.js'
import { appendAuditEvent } from './lib/audit.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, ctx: Context) => {
  const tenantId = 'default'
  const { id } = ctx.params
  const current = await getItem<any>(policyKey(id))
  if (!current || current.tenant_id !== tenantId) return json({ error: 'Policy not found' }, 404)

  if (req.method !== 'PUT') return json({ error: 'Method not allowed' }, 405)

  const body = await req.json().catch(() => ({}))
  const now = new Date().toISOString()
  const next = {
    ...current,
    name: body.name ?? current.name,
    active: body.active ?? current.active,
    rules: {
      ...current.rules,
      ...(body.rules ?? {}),
    },
    updated_at: now,
  }

  if (next.active) {
    const existing = (await listByPrefix('policy/')).filter((p: any) => p.tenant_id === tenantId && p.active && p.id !== id)
    for (const prior of existing) {
      await setItem(policyKey(prior.id), { ...prior, active: false, updated_at: now })
    }
  }

  await setItem(policyKey(id), next)
  await appendAuditEvent({
    tenant_id: tenantId,
    entity_type: 'policy',
    entity_id: id,
    action: 'policy.updated',
    reason: 'Policy updated',
    metadata: { active: next.active },
  })
  return json(next)
}

export const config = { path: '/api/policies/:id' }

