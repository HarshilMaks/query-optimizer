import type { Context } from '@netlify/functions'
import { listByPrefix } from './lib/storage.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, ctx: Context) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  const tenantId = 'default'
  const { id } = ctx.params
  const events = (await listByPrefix('audit/'))
    .filter((e: any) => e.tenant_id === tenantId)
    .filter((e: any) =>
      (e.entity_type === 'suggestion' && e.entity_id === id)
      || (e.metadata?.recommendation_id === id),
    )
    .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  return json({ recommendation_id: id, events })
}

export const config = { path: '/api/audit/recommendations/:id/timeline' }

