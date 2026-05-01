import type { Context } from '@netlify/functions'
import { listByPrefix } from './lib/storage.js'
import { getRequestContext } from './lib/request-context.js'
import { requireAuth } from './lib/rbac.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  // Require authentication
  try {
    requireAuth(req)
  } catch (error) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const { tenantId } = getRequestContext(req)
  const url = new URL(req.url)
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? 100), 500))
  const action = url.searchParams.get('action') // Optional filter
  const entityType = url.searchParams.get('entityType') // Optional filter

  let events = (await listByPrefix('audit/'))
    .filter((e: any) => e.tenant_id === tenantId)
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Apply optional filters
  if (action) {
    events = events.filter((e: any) => e.action === action)
  }
  if (entityType) {
    events = events.filter((e: any) => e.entity_type === entityType)
  }

  return json({
    events: events.slice(0, limit),
    total: events.length,
    limit,
  })
}

export const config = { path: '/api/audit/events' }
