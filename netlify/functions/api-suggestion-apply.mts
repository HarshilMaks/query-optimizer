import type { Context } from '@netlify/functions'
import { getItem, setItem, suggestionKey, queryKey } from './lib/storage.js'
import { appendAuditEvent } from './lib/audit.js'
import { getRequestContext } from './lib/request-context.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const { tenantId, actorId } = getRequestContext(req)
  const { id } = ctx.params
  const suggestion = await getItem<any>(suggestionKey(id))
  if (!suggestion) return json({ error: 'Not found' }, 404)

  if (suggestion.tenant_id && suggestion.tenant_id !== tenantId) {
    return json({ error: 'Not found' }, 404)
  }

  if (suggestion.policy_decision === 'blocked') {
    return json({ error: 'Suggestion is blocked by active guardrail policy' }, 409)
  }

  if (suggestion.policy_decision === 'approval_required' && suggestion.approval_status !== 'approved') {
    return json({ error: 'Manual approval is required before apply' }, 409)
  }

  if (suggestion.status === 'applied') {
    return json({ success: true, suggestion, modal: { title: 'Already Applied', message: 'This suggestion was already marked as applied.', sql: suggestion.sql_to_run } })
  }

  const updated = {
    ...suggestion,
    status: 'applied',
    applied_at: new Date().toISOString(),
    applied_by: actorId,
  }
  await setItem(suggestionKey(id), updated)

  if (suggestion.query_id) {
    const query = await getItem<any>(queryKey(suggestion.query_id))
    if (query) await setItem(queryKey(suggestion.query_id), { ...query, status: 'optimized' })
  }

  await appendAuditEvent({
    tenant_id: tenantId,
    entity_type: 'suggestion',
    entity_id: id,
    action: 'suggestion.applied',
    actor_id: actorId,
    reason: 'Marked as applied',
    metadata: { query_id: suggestion.query_id, suggestion_type: suggestion.suggestion_type },
  })

  return json({
    success: true,
    suggestion: updated,
    modal: {
      title: 'Apply Suggestion Manually',
      message: 'Copy this SQL and run it on your database or read replica. The platform does not execute optimization SQL on your behalf.',
      sql: suggestion.sql_to_run,
    },
  })
}

export const config = { path: '/api/suggestions/:id/apply' }
