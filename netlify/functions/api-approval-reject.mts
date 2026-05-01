import type { Context } from '@netlify/functions'
import { getItem, setItem, approvalKey, suggestionKey } from './lib/storage.js'
import { appendAuditEvent } from './lib/audit.js'
import { getRequestContext } from './lib/request-context.js'
import { requireAuth, requireRole } from './lib/rbac.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Require admin to reject
  try {
    const claims = requireAuth(req)
    requireRole(claims, 'admin')
  } catch (error) {
    return json({ error: 'Unauthorized: Admin role required' }, 401)
  }

  const { tenantId, actorId } = getRequestContext(req)
  const { id } = ctx.params
  const approval = await getItem<any>(approvalKey(id))
  if (!approval || approval.tenant_id !== tenantId) return json({ error: 'Approval not found' }, 404)
  if (approval.status !== 'pending') return json({ error: 'Approval already resolved' }, 409)

  const body = await req.json().catch(() => ({}))
  const resolvedAt = new Date().toISOString()
  const updated = {
    ...approval,
    status: 'rejected',
    decided_at: resolvedAt,
    decided_by: actorId,
    decision_reason: body.reason ?? 'Rejected by reviewer',
  }
  await setItem(approvalKey(id), updated)

  const suggestion = await getItem<any>(suggestionKey(approval.recommendation_id))
  if (suggestion) {
    await setItem(suggestionKey(suggestion.id), {
      ...suggestion,
      approval_status: 'rejected',
      approval_id: id,
      rejected_at: resolvedAt,
      rejected_by: updated.decided_by,
      status: 'dismissed',
    })
  }

  await appendAuditEvent({
    tenant_id: tenantId,
    entity_type: 'approval',
    entity_id: id,
    action: 'approval.rejected',
    actor_id: updated.decided_by,
    reason: updated.decision_reason,
    metadata: { recommendation_id: approval.recommendation_id },
  })

  return json(updated)
}

export const config = { path: '/api/approvals/:id/reject' }
