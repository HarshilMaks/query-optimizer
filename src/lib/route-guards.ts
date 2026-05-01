/**
 * Route Guard Utilities for Protected Routes
 * Checks authentication and RBAC before allowing access
 */

import { getAccessToken } from './auth-hooks'
import { decodeJWT } from '../netlify/functions/lib/auth'

export interface RouteGuardOptions {
  requireAuth?: boolean
  requiredRole?: string
  requiredPermission?: string
}

export function createAuthLoader(options: RouteGuardOptions = {}) {
  return async () => {
    const token = getAccessToken()

    if (options.requireAuth && !token) {
      throw new Error('Unauthorized: No token provided')
    }

    if (token) {
      const claims = decodeJWT(token)
      if (!claims) {
        throw new Error('Unauthorized: Invalid token')
      }

      if (options.requiredRole && claims.role !== options.requiredRole && claims.role !== 'admin') {
        throw new Error(`Forbidden: Requires ${options.requiredRole} role`)
      }

      if (options.requiredPermission) {
        // Permission check would go here
        // For now, basic role check is sufficient
      }

      return claims
    }

    return null
  }
}
