import type { Context } from '@netlify/functions'
import { getItem, setItem, listByPrefix, queryKey, explainKey, analysisKey, suggestionKey, approvalKey } from './lib/storage.js'
import { analyzeExecutionPlan, checkRateLimit } from './lib/gemini.js'
import { assessSuggestion, getActivePolicy } from './lib/guardrails.js'
import { appendAuditEvent } from './lib/audit.js'
import { getRequestContext } from './lib/request-context.js'
import type { SlowQuery } from './api-queries.mjs'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const { id } = ctx.params

  const rateCheck = await checkRateLimit()
  if (!rateCheck.allowed) return json({ error: 'Rate limit exceeded. Max 20 AI analyses per hour.' }, 429)

  const query = await getItem<SlowQuery>(queryKey(id))
  if (!query) return json({ error: 'Query not found' }, 404)
  const { tenantId, actorId } = getRequestContext(req)

  // Get most recent explain result
  const explains = (await listByPrefix('explain/')).filter((e: any) => e.query_id === id)
    .sort((a: any, b: any) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime())

  const body = await req.json().catch(() => ({}))
  let planJson = explains[0]?.raw_plan_json

  if (body.explain_result_id) {
    const specific = await getItem<any>(explainKey(body.explain_result_id))
    if (specific) planJson = specific.raw_plan_json
  }

  if (!planJson) return json({ error: 'No EXPLAIN ANALYZE result found. Run EXPLAIN ANALYZE first.' }, 422)

  try {
    const result = await analyzeExecutionPlan(query.query_text, planJson)
    const analysisId = crypto.randomUUID()
    const analysis = {
      id: analysisId, query_id: id, explain_result_id: explains[0]?.id ?? null,
      summary: result.summary, bottlenecks_json: result.bottlenecks,
      model_used: 'gemini-2.0-flash', tokens_used: result.tokens_used,
      cost_usd: 0, created_at: new Date().toISOString(),
      tenant_id: tenantId,
    }
    await setItem(analysisKey(analysisId), analysis)
    await appendAuditEvent({
      tenant_id: tenantId,
      actor_id: actorId,
      entity_type: 'analysis',
      entity_id: analysisId,
      action: 'analysis.created',
      reason: 'AI analysis completed',
      metadata: { query_id: id, model_used: analysis.model_used },
    })

    // Save suggestions
    const activePolicy = await getActivePolicy(tenantId)
    const suggestions = []
    for (const rec of (result.index_recommendations ?? [])) {
      const sid = crypto.randomUUID()
      const assessed = assessSuggestion(
        { suggestion_type: 'index', estimated_improvement_pct: rec.estimated_improvement_pct, sql_to_run: rec.sql },
        activePolicy,
      )
      const suggestion = {
        id: sid, analysis_id: analysisId, query_id: id,
        suggestion_type: 'index', title: rec.title, description: rec.explanation,
        sql_to_run: rec.sql, estimated_improvement_pct: rec.estimated_improvement_pct,
        status: 'pending', applied_at: null, created_at: new Date().toISOString(),
        tenant_id: tenantId,
        risk_score: assessed.risk_score,
        confidence_score: assessed.confidence_score,
        policy_decision: assessed.policy_decision,
        policy_reason: assessed.decision_reason,
      }
      await setItem(suggestionKey(sid), suggestion)
      suggestions.push(suggestion)
      await appendAuditEvent({
        tenant_id: tenantId,
      actor_id: actorId,
      entity_type: 'suggestion',
        entity_id: sid,
        action: 'suggestion.created',
        reason: assessed.decision_reason,
        metadata: { policy_decision: assessed.policy_decision, risk_score: assessed.risk_score },
      })

      if (assessed.policy_decision === 'approval_required') {
        const approvalId = crypto.randomUUID()
        await setItem(approvalKey(approvalId), {
          id: approvalId,
          tenant_id: tenantId,
          recommendation_id: sid,
          query_id: id,
          status: 'pending',
          requested_at: new Date().toISOString(),
          requested_by: 'system',
          reason: assessed.decision_reason,
          risk_score: assessed.risk_score,
          confidence_score: assessed.confidence_score,
        })
        await appendAuditEvent({
          tenant_id: tenantId,
      actor_id: actorId,
      entity_type: 'approval',
          entity_id: approvalId,
          action: 'approval.requested',
          reason: assessed.decision_reason,
          metadata: { recommendation_id: sid, risk_score: assessed.risk_score },
        })
      }
    }
    if (result.query_rewrite) {
      const sid = crypto.randomUUID()
      const assessed = assessSuggestion(
        { suggestion_type: 'rewrite', estimated_improvement_pct: 40, sql_to_run: result.query_rewrite.rewritten },
        activePolicy,
      )
      const suggestion = {
        id: sid, analysis_id: analysisId, query_id: id,
        suggestion_type: 'rewrite', title: 'Query Rewrite',
        description: result.query_rewrite.explanation,
        sql_to_run: result.query_rewrite.rewritten,
        estimated_improvement_pct: 40, status: 'pending', applied_at: null,
        created_at: new Date().toISOString(),
        original_query: result.query_rewrite.original,
        rewritten_query: result.query_rewrite.rewritten,
        tenant_id: tenantId,
        risk_score: assessed.risk_score,
        confidence_score: assessed.confidence_score,
        policy_decision: assessed.policy_decision,
        policy_reason: assessed.decision_reason,
      }
      await setItem(suggestionKey(sid), suggestion)
      suggestions.push(suggestion)
      await appendAuditEvent({
        tenant_id: tenantId,
      actor_id: actorId,
      entity_type: 'suggestion',
        entity_id: sid,
        action: 'suggestion.created',
        reason: assessed.decision_reason,
        metadata: { policy_decision: assessed.policy_decision, risk_score: assessed.risk_score },
      })

      if (assessed.policy_decision === 'approval_required') {
        const approvalId = crypto.randomUUID()
        await setItem(approvalKey(approvalId), {
          id: approvalId,
          tenant_id: tenantId,
          recommendation_id: sid,
          query_id: id,
          status: 'pending',
          requested_at: new Date().toISOString(),
          requested_by: 'system',
          reason: assessed.decision_reason,
          risk_score: assessed.risk_score,
          confidence_score: assessed.confidence_score,
        })
        await appendAuditEvent({
          tenant_id: tenantId,
      actor_id: actorId,
      entity_type: 'approval',
          entity_id: approvalId,
          action: 'approval.requested',
          reason: assessed.decision_reason,
          metadata: { recommendation_id: sid, risk_score: assessed.risk_score },
        })
      }
    }

    // Update query status
    await setItem(queryKey(id), { ...query, status: 'analyzed' })
    await appendAuditEvent({
      tenant_id: tenantId,
      actor_id: actorId,
      entity_type: 'query',
      entity_id: id,
      action: 'query.analyzed',
      reason: 'Query analyzed and recommendations generated',
      metadata: { analysis_id: analysisId, suggestion_count: suggestions.length },
    })

    return json({ analysis, suggestions, bottlenecks: result.bottlenecks, rateLimit: rateCheck })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'AI analysis failed' }, 500)
  }
}

export const config = { path: '/api/queries/:id/analyze' }
