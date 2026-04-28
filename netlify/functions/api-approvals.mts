import type { Context } from '@netlify/functions'
import { getItem, listByPrefix, suggestionKey } from './lib/storage.js'
import { getRequestContext } from './lib/request-context.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  const { tenantId } = getRequestContext(req)
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  let approvals = (await listByPrefix('approval/')).filter((a: any) => a.tenant_id === tenantId)
  if (status) approvals = approvals.filter((a: any) => a.status === status)

  const enriched = await Promise.all(approvals.map(async (a: any) => {
    const suggestion = await getItem<any>(suggestionKey(a.recommendation_id))
    return {
      ...a,
      recommendation: suggestion ? {
        id: suggestion.id,
        title: suggestion.title,
        suggestion_type: suggestion.suggestion_type,
        risk_score: suggestion.risk_score,
        confidence_score: suggestion.confidence_score,
      } : null,
    }
  }))

  return json(enriched.sort((a: any, b: any) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()))
}

export const config = { path: '/api/approvals' }
