/**
 * Authentication & Authorization Types
 * Defines JWT claims, user roles, and permission scopes
 */

export type UserRole = 'admin' | 'editor' | 'viewer'

export interface JWTClaims {
  sub: string // userId
  email: string
  tenantId: string
  role: UserRole
  iat: number // issued at
  exp: number // expiration
  permissions?: string[] // optional scoped permissions
}

export interface User {
  id: string
  email: string
  passwordHash?: string // never expose to client
  tenantId: string
  roles: UserRole[]
  createdAt: Date
  updatedAt: Date
}

export interface Session {
  id: string
  userId: string
  refreshToken: string
  expiresAt: Date
  createdAt: Date
}

export interface AuditLog {
  id: string
  userId: string
  action: 'create' | 'update' | 'delete' | 'validate' | 'approve' | 'reject' | 'login' | 'logout'
  resource: string // e.g., 'suggestion:123'
  resourceId: string
  changes?: Record<string, unknown>
  tenantId: string
  timestamp: Date
  ipAddress?: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number // seconds
}

export interface AuthResponse {
  user: Omit<User, 'passwordHash'>
  tokens: TokenPair
}

export interface LoginRequest {
  email: string
  password: string
}

export interface SignupRequest {
  email: string
  password: string
  name?: string
}

// Permission scopes for RBAC
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    'suggestions:create',
    'suggestions:read',
    'suggestions:update',
    'suggestions:delete',
    'validations:run',
    'validations:read',
    'approvals:create',
    'approvals:read',
    'approvals:update',
    'connections:manage',
    'audit:read',
    'users:manage',
  ],
  editor: [
    'suggestions:create',
    'suggestions:read',
    'suggestions:update',
    'validations:run',
    'validations:read',
    'approvals:read',
    'audit:read',
  ],
  viewer: ['suggestions:read', 'validations:read', 'approvals:read', 'audit:read'],
}

export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function requirePermission(role: UserRole, permission: string): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Forbidden: requires ${permission}`)
  }
}
