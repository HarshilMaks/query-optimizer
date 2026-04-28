import type { Context } from '@netlify/functions'
import { listByPrefix } from './lib/storage.js'
import { getRequestContext } from './lib/request-context.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  const { tenantId } = getRequestContext(req)
  const url = new URL(req.url)
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? 100), 500))

  const events = (await listByPrefix('audit/'))
    .filter((e: any) => e.tenant_id === tenantId)
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit)

  return json(events)
}

export const config = { path: '/api/audit/events' }
