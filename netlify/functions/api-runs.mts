import type { Context } from '@netlify/functions'
import { listByPrefix } from './lib/storage.js'
import { getRequestContext } from './lib/request-context.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const { tenantId } = getRequestContext(req)

  const runs = (await listByPrefix('run/'))
    .filter((r: any) => r.tenant_id === tenantId)
    .sort((a: any, b: any) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())

  return json(runs)
}

export const config = { path: '/api/runs' }
