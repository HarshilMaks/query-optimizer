import type { Context } from '@netlify/functions'
import { getItem, setItem, queryKey, connKey, explainKey } from './lib/storage.js'
import { runExplainAnalyze } from './lib/pg-client.js'
import type { SlowQuery } from './api-queries.mjs'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const { id } = ctx.params
  const query = await getItem<SlowQuery>(queryKey(id))
  if (!query) return json({ error: 'Query not found' }, 404)

  const conn = await getItem<any>(connKey(query.connection_id))
  if (!conn) return json({ error: 'Connection not found' }, 404)

  const { plan, error } = await runExplainAnalyze(conn, query.query_text)
  if (error) return json({ error }, 422)

  const topPlan = Array.isArray(plan) ? plan[0] : plan
  const planNode = topPlan?.Plan ?? topPlan
  const explainId = crypto.randomUUID()
  const explainResult = {
    id: explainId, query_id: id,
    raw_plan_json: plan,
    plan_summary_text: `${planNode?.['Node Type'] ?? 'Unknown'} — Cost: ${planNode?.['Total Cost'] ?? 0}`,
    total_cost: planNode?.['Total Cost'] ?? 0,
    actual_total_time: planNode?.['Actual Total Time'] ?? 0,
    executed_at: new Date().toISOString(),
  }
  await setItem(explainKey(explainId), explainResult)
  return json(explainResult)
}

export const config = { path: '/api/queries/:id/explain' }
