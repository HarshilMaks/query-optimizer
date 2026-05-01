import type { JWTClaims } from '../../src/lib/auth-types.js'
import { decodeJWT, extractTokenFromRequest } from './auth.js'

export interface RequestContext {
  tenantId: string
  userId?: string
  email?: string
  role?: string
  actorId: string // kept for backward compatibility
}

const TENANT_HEADER = 'x-tenant-id'
const ACTOR_HEADER = 'x-actor-id'

export function getRequestContext(req: Request): RequestContext {
  // Try JWT first
  const token = extractTokenFromRequest(req)
  if (token) {
    const claims = decodeJWT(token)
    if (claims) {
      return {
        tenantId: claims.tenantId,
        userId: claims.sub,
        email: claims.email,
        role: claims.role,
        actorId: claims.sub, // use userId as actorId
      }
    }
  }

  // Fallback to header-based context (for backward compatibility)
  const tenantHeader = req.headers.get(TENANT_HEADER)?.trim()
  const actorHeader = req.headers.get(ACTOR_HEADER)?.trim()

  return {
    tenantId: tenantHeader || 'default',
    actorId: actorHeader || 'system',
  }
}
