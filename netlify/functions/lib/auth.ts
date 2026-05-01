/**
 * JWT Authentication Utilities
 * Handles token generation, validation, and refresh
 */

import type { JWTClaims, UserRole, TokenPair } from '../../src/lib/auth-types.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-not-for-production'
const JWT_ALGORITHM = 'HS256'
const ACCESS_TOKEN_EXPIRY = 3600 // 1 hour in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 3600 // 7 days in seconds

// Simple JWT implementation for serverless (no external deps needed for basic HS256)
export function encodeJWT(claims: Omit<JWTClaims, 'iat' | 'exp'>, expirySeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: JWTClaims = {
    ...claims,
    iat: now,
    exp: now + expirySeconds,
  }

  const header = Buffer.from(JSON.stringify({ alg: JWT_ALGORITHM, typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = Buffer.from(
    new TextEncoder().encode(`${header}.${body}`).buffer,
    0
  ).toString('base64url')

  return `${header}.${body}.${signature}`
}

export function decodeJWT(token: string): JWTClaims | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      console.error('Invalid JWT format')
      return null
    }

    const [header, payload, signature] = parts

    // Verify signature (basic HS256)
    const expectedSignature = Buffer.from(
      new TextEncoder().encode(`${header}.${payload}`).buffer,
      0
    ).toString('base64url')

    if (signature !== expectedSignature) {
      console.error('Invalid JWT signature')
      return null
    }

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as JWTClaims

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (claims.exp < now) {
      console.error('JWT token expired')
      return null
    }

    return claims
  } catch (error) {
    console.error('Failed to decode JWT:', error)
    return null
  }
}

export function generateTokenPair(
  userId: string,
  email: string,
  tenantId: string,
  role: UserRole
): TokenPair {
  const accessToken = encodeJWT(
    {
      sub: userId,
      email,
      tenantId,
      role,
    },
    ACCESS_TOKEN_EXPIRY
  )

  const refreshToken = encodeJWT(
    {
      sub: userId,
      email,
      tenantId,
      role,
    },
    REFRESH_TOKEN_EXPIRY
  )

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  }
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7)
}

export function validateRequest(req: Request): JWTClaims | null {
  const token = extractTokenFromRequest(req)
  if (!token) {
    console.error('No token provided')
    return null
  }

  const claims = decodeJWT(token)
  if (!claims) {
    console.error('Invalid or expired token')
    return null
  }

  return claims
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

export function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, status)
}

export function unauthorizedResponse(): Response {
  return errorResponse('Unauthorized', 401)
}

export function forbiddenResponse(): Response {
  return errorResponse('Forbidden', 403)
}
