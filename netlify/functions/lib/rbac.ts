/**
 * RBAC (Role-Based Access Control) Middleware
 * Enforces role-based permissions on Netlify functions
 */

import type { JWTClaims, UserRole } from '../../../src/lib/auth-types.js'
import { decodeJWT, extractTokenFromRequest, forbiddenResponse } from './auth.js'
import { ROLE_PERMISSIONS } from '../../../src/lib/auth-types.js'

/**
 * Extract and validate JWT claims from request
 * Returns claims if valid, null if missing/invalid token
 */
export function extractClaims(req: Request): JWTClaims | null {
  const token = extractTokenFromRequest(req)
  if (!token) {
    return null
  }
  return decodeJWT(token)
}

/**
 * Middleware: Require authenticated user
 * Returns claims if authenticated, throws error if not
 */
export function requireAuth(req: Request): JWTClaims {
  const claims = extractClaims(req)
  if (!claims) {
    throw new Error('Unauthorized: Authentication required')
  }
  return claims
}

/**
 * Middleware: Require specific role
 * Allows admin to bypass role checks
 */
export function requireRole(claims: JWTClaims, requiredRole: UserRole | UserRole[]): void {
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
  
  // Admin can do anything
  if (claims.role === 'admin') {
    return
  }

  // Check if user's role is in required roles
  if (!roles.includes(claims.role)) {
    throw new Error(`Forbidden: Requires one of ${roles.join(', ')} role`)
  }
}

/**
 * Middleware: Require specific permission
 * Checks permission against user's role
 */
export function requirePermission(claims: JWTClaims, permission: string): void {
  const permissions = ROLE_PERMISSIONS[claims.role] || []
  
  if (!permissions.includes(permission)) {
    throw new Error(`Forbidden: Requires ${permission} permission`)
  }
}

/**
 * Helper: Check if user has permission
 */
export function hasPermission(claims: JWTClaims, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[claims.role] || []
  return permissions.includes(permission)
}

/**
 * Middleware: Enforce permission for request
 * Used as: if (!requirePermissionMiddleware(req, 'suggestions:delete')) return forbiddenResponse()
 */
export function checkPermission(req: Request, permission: string): boolean {
  try {
    const claims = requireAuth(req)
    return hasPermission(claims, permission)
  } catch {
    return false
  }
}

/**
 * Error response for permission denied
 */
export function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

export function unauthorizedResponse() {
  return errorResponse('Unauthorized', 401)
}

export function notFoundResponse() {
  return errorResponse('Not found', 404)
}
