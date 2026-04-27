import type { Context } from '@netlify/functions'
import { listByPrefix, setItem, policyKey } from './lib/storage.js'
import { appendAuditEvent } from './lib/audit.js'
import { DEFAULT_POLICY_RULES, getActivePolicy } from './lib/guardrails.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, _ctx: Context) => {
  const tenantId = 'default'

  if (req.method === 'GET') {
    await getActivePolicy(tenantId)
    const policies = (await listByPrefix('policy/'))
      .filter((p: any) => p.tenant_id === tenantId)
      .sort((a: any, b: any) => Number(b.active) - Number(a.active) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    return json(policies)
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}))
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const policy = {
      id,
      tenant_id: tenantId,
      name: body.name ?? 'Custom Policy',
      active: Boolean(body.active),
      rules: {
        ...DEFAULT_POLICY_RULES,
        ...(body.rules ?? {}),
      },
      created_at: now,
      updated_at: now,
    }

    if (policy.active) {
      const existing = (await listByPrefix('policy/')).filter((p: any) => p.tenant_id === tenantId && p.active)
      for (const prior of existing) {
        await setItem(policyKey(prior.id), { ...prior, active: false, updated_at: now })
      }
    }

    await setItem(policyKey(id), policy)
    await appendAuditEvent({
      tenant_id: tenantId,
      entity_type: 'policy',
      entity_id: id,
      action: 'policy.created',
      reason: 'Policy created',
      metadata: { name: policy.name, active: policy.active },
    })
    return json(policy, 201)
  }

  return json({ error: 'Method not allowed' }, 405)
}

export const config = { path: '/api/policies' }

