export interface RequestContext {
  tenantId: string
  actorId: string
}

const TENANT_HEADER = 'x-tenant-id'
const ACTOR_HEADER = 'x-actor-id'

export function getRequestContext(req: Request): RequestContext {
  const tenantHeader = req.headers.get(TENANT_HEADER)?.trim()
  const actorHeader = req.headers.get(ACTOR_HEADER)?.trim()

  return {
    tenantId: tenantHeader || 'default',
    actorId: actorHeader || 'system',
  }
}
