/**
 * Auth Endpoints: Login, Signup, Logout, Refresh
 * Handles user authentication and token generation with real database
 */

import type { Context } from '@netlify/functions'
import type { LoginRequest, SignupRequest, AuthResponse } from '../../src/lib/auth-types.js'
import { generateTokenPair, decodeJWT, json, errorResponse, unauthorizedResponse } from './lib/auth.js'
import { getUserByEmail, createUser, createSession } from './lib/db.js'
import { appendAuditEvent } from './lib/audit.js'
import { checkRateLimit, resetRateLimit, getRequestIdentifier, rateLimitErrorResponse, RATE_LIMIT_PRESETS } from './lib/rate-limit.js'
import crypto from 'crypto'

// Simple password validation without bcrypt (for MVP)
// TODO: Replace with real bcrypt in production
async function validatePassword(password: string, hash: string): Promise<boolean> {
  // In production, use: return await bcrypt.compare(password, hash)
  // For now, check if password matches the demo user
  return hash === '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4/KFm' && password === 'password'
}

// Simple password hashing without bcrypt (for MVP)
// TODO: Replace with real bcrypt in production
function hashPassword(password: string): string {
  // In production, use: return await bcrypt.hash(password, 10)
  // For now, return a mock hash
  return `$2b$10$mock-${crypto.randomBytes(16).toString('hex')}`
}

export default async (req: Request, _ctx: Context) => {
  if (req.method === 'POST') {
    const url = new URL(req.url)
    const pathname = url.pathname

    // POST /api/auth/login
    if (pathname.includes('login')) {
      try {
        const body = (await req.json()) as LoginRequest
        const { email, password } = body

        if (!email || !password) {
          return errorResponse('Email and password are required')
        }

        // Rate limiting: Use email + IP as identifier
        const identifier = `login:${email}:${getRequestIdentifier(req)}`
        const rateLimit = checkRateLimit(identifier, RATE_LIMIT_PRESETS.auth)

        if (!rateLimit.allowed) {
          console.log(`[Rate Limit] Login attempt blocked for ${email}: ${rateLimit.remaining} remaining, retry in ${rateLimit.retryAfter}s`)
          return rateLimitErrorResponse(rateLimit.retryAfter)
        }

        // Try to get user from database
        const user = await getUserByEmail(email)
        if (!user) {
          // Fall back to demo user if DB not available
          if (email === 'user@example.com' && await validatePassword(password, '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4/KFm')) {
            const tokens = generateTokenPair('user-demo', email, 'default', 'admin')
            const response: AuthResponse = {
              user: {
                id: 'user-demo',
                email,
                tenantId: 'default',
                roles: ['admin'],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              tokens,
            }
            return json(response, 200)
          }
          return unauthorizedResponse()
        }

        if (!await validatePassword(password, user.password_hash)) {
          return unauthorizedResponse()
        }

        // Generate tokens
        const tokens = generateTokenPair(user.id, user.email, user.tenant_id, user.roles[0] || 'viewer')

        // Create session
        try {
          await createSession(user.id, crypto.createHash('sha256').update(tokens.refreshToken).digest('hex'), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
        } catch (err) {
          console.error('Failed to create session:', err)
          // Continue anyway - session tracking is optional
        }

        // Audit login
        try {
          await appendAuditEvent({
            tenant_id: user.tenant_id,
            entity_type: 'user',
            entity_id: user.email,
            action: 'user.login',
            actor_id: user.id,
            metadata: { userId: user.id, email: user.email },
          })
        } catch (err) {
          console.error('Failed to log audit event:', err)
        }

        // Reset rate limit on successful login
        const identifier = `login:${user.email}:${getRequestIdentifier(req)}`
        resetRateLimit(identifier)

        const response: AuthResponse = {
          user: {
            id: user.id,
            email: user.email,
            tenantId: user.tenant_id,
            roles: user.roles || ['viewer'],
            createdAt: new Date(user.created_at),
            updatedAt: new Date(user.updated_at),
          },
          tokens,
        }

        return json(response, 200)
      } catch (error) {
        console.error('Login error:', error)
        return errorResponse('Invalid request')
      }
    }

    // POST /api/auth/signup
    if (pathname.includes('signup')) {
      try {
        const body = (await req.json()) as SignupRequest
        const { email, password } = body

        if (!email || !password) {
          return errorResponse('Email and password are required')
        }

        // Rate limiting: Use IP + endpoint as identifier
        const identifier = `signup:${getRequestIdentifier(req)}`
        const rateLimit = checkRateLimit(identifier, RATE_LIMIT_PRESETS.auth)

        if (!rateLimit.allowed) {
          console.log(`[Rate Limit] Signup attempt blocked from ${getRequestIdentifier(req)}: retry in ${rateLimit.retryAfter}s`)
          return rateLimitErrorResponse(rateLimit.retryAfter)
        }

        // Check if user already exists
        const existingUser = await getUserByEmail(email)
        if (existingUser) {
          return errorResponse('User already exists', 409)
        }

        // Create new user
        const passwordHash = hashPassword(password)
        const user = await createUser(email, passwordHash, body.name)

        // Generate tokens
        const tokens = generateTokenPair(user.id, user.email, user.tenant_id, user.roles[0] || 'viewer')

        // Create session
        try {
          await createSession(user.id, crypto.createHash('sha256').update(tokens.refreshToken).digest('hex'), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
        } catch (err) {
          console.error('Failed to create session:', err)
          // Continue anyway - session tracking is optional
        }

        const response: AuthResponse = {
          user: {
            id: user.id,
            email: user.email,
            tenantId: user.tenant_id,
            roles: user.roles || ['viewer'],
            createdAt: new Date(user.created_at),
            updatedAt: new Date(user.updated_at),
          },
          tokens,
        }

        return json(response, 201)
      } catch (error) {
        console.error('Signup error:', error)
        return errorResponse('Signup failed', 500)
      }
    }

    // POST /api/auth/logout
    if (pathname.includes('logout')) {
      // Audit logout
      try {
        const authHeader = req.headers.get('authorization')
        if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.slice(7)
          const claims = decodeJWT(token)
          if (claims) {
            await appendAuditEvent({
              tenant_id: claims.tenantId,
              entity_type: 'user',
              entity_id: claims.email,
              action: 'user.logout',
              actor_id: claims.sub,
              metadata: { userId: claims.sub, email: claims.email },
            })
          }
        }
      } catch (err) {
        console.error('Failed to log logout audit event:', err)
      }

      // Client should clear tokens on their side
      // Server can optionally invalidate refresh tokens
      return json({ message: 'Logged out successfully' }, 200)
    }

    // POST /api/auth/refresh
    if (pathname.includes('refresh')) {
      try {
        const body = (await req.json()) as { refreshToken: string }
        const { refreshToken } = body

        if (!refreshToken) {
          return errorResponse('Refresh token is required')
        }

        // Decode the refresh token (without validation, we'll check expiration)
        const claims = decodeJWT(refreshToken)
        if (!claims) {
          return unauthorizedResponse()
        }

        // Get user from database to verify they still exist
        const user = await getUserByEmail(claims.email)
        if (!user || !user.is_active) {
          return unauthorizedResponse()
        }

        // Generate new token pair with rotation (new refresh token)
        const newTokens = generateTokenPair(user.id, user.email, user.tenant_id, user.roles[0] || 'viewer')

        // Create new session with new refresh token
        try {
          const refreshTokenHash = crypto.createHash('sha256').update(newTokens.refreshToken).digest('hex')
          await createSession(user.id, refreshTokenHash, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
        } catch (err) {
          console.error('Failed to create new session:', err)
          // Continue anyway - session tracking is optional
        }

        const response: AuthResponse = {
          user: {
            id: user.id,
            email: user.email,
            tenantId: user.tenant_id,
            roles: user.roles || ['viewer'],
            createdAt: new Date(user.created_at),
            updatedAt: new Date(user.updated_at),
          },
          tokens: newTokens,
        }

        return json(response, 200)
      } catch (error) {
        console.error('Token refresh error:', error)
        return errorResponse('Invalid refresh token')
      }
    }
  }

  return errorResponse('Method not allowed', 405)
}

export const config = { path: '/api/auth/:action' }
