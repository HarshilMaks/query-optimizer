import type { Context } from '@netlify/functions'
import { getItem, setItem, listByPrefix, queryKey, explainKey, analysisKey, suggestionKey } from './lib/storage.js'
import { analyzeExecutionPlan, checkRateLimit } from './lib/gemini.js'
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
    }
    await setItem(analysisKey(analysisId), analysis)

    // Save suggestions
    const suggestions = []
    for (const rec of (result.index_recommendations ?? [])) {
      const sid = crypto.randomUUID()
      const suggestion = {
        id: sid, analysis_id: analysisId, query_id: id,
        suggestion_type: 'index', title: rec.title, description: rec.explanation,
        sql_to_run: rec.sql, estimated_improvement_pct: rec.estimated_improvement_pct,
        status: 'pending', applied_at: null, created_at: new Date().toISOString(),
      }
      await setItem(suggestionKey(sid), suggestion)
      suggestions.push(suggestion)
    }
    if (result.query_rewrite) {
      const sid = crypto.randomUUID()
      const suggestion = {
        id: sid, analysis_id: analysisId, query_id: id,
        suggestion_type: 'rewrite', title: 'Query Rewrite',
        description: result.query_rewrite.explanation,
        sql_to_run: result.query_rewrite.rewritten,
        estimated_improvement_pct: 40, status: 'pending', applied_at: null,
        created_at: new Date().toISOString(),
        original_query: result.query_rewrite.original,
        rewritten_query: result.query_rewrite.rewritten,
      }
      await setItem(suggestionKey(sid), suggestion)
      suggestions.push(suggestion)
    }

    // Update query status
    await setItem(queryKey(id), { ...query, status: 'analyzed' })

    return json({ analysis, suggestions, bottlenecks: result.bottlenecks, rateLimit: rateCheck })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'AI analysis failed' }, 500)
  }
}

export const config = { path: '/api/queries/:id/analyze' }
