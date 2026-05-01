/**
 * Test suite for refresh token functionality
 */

import { describe, it, expect } from 'vitest'
import { encodeJWT, decodeJWT, generateTokenPair } from '../lib/auth'

describe('Refresh Token System', () => {
  describe('JWT Token Generation', () => {
    it('should generate valid token pair with access and refresh tokens', () => {
      const tokens = generateTokenPair('user-123', 'user@example.com', 'tenant-1', 'admin')

      expect(tokens).toHaveProperty('accessToken')
      expect(tokens).toHaveProperty('refreshToken')
      expect(tokens).toHaveProperty('expiresIn')
      expect(tokens.expiresIn).toBe(3600) // 1 hour
    })

    it('should encode JWT with correct claims', () => {
      const token = encodeJWT(
        {
          sub: 'user-123',
          email: 'user@example.com',
          tenantId: 'tenant-1',
          role: 'admin',
        },
        3600
      )

      expect(token).toMatch(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/)
    })

    it('should decode JWT and extract claims', () => {
      const originalClaims = {
        sub: 'user-456',
        email: 'test@example.com',
        tenantId: 'tenant-2',
        role: 'viewer' as const,
      }

      const token = encodeJWT(originalClaims, 3600)
      const decodedClaims = decodeJWT(token)

      expect(decodedClaims).toMatchObject(originalClaims)
      expect(decodedClaims?.iat).toBeDefined()
      expect(decodedClaims?.exp).toBeDefined()
    })

    it('should reject expired tokens', () => {
      const token = encodeJWT(
        {
          sub: 'user-789',
          email: 'expired@example.com',
          tenantId: 'tenant-3',
          role: 'editor' as const,
        },
        -1 // Already expired
      )

      const decodedClaims = decodeJWT(token)
      expect(decodedClaims).toBeNull()
    })

    it('should reject tampered tokens', () => {
      const token = encodeJWT(
        {
          sub: 'user-999',
          email: 'tamper@example.com',
          tenantId: 'tenant-4',
          role: 'admin',
        },
        3600
      )

      // Tamper with the payload
      const parts = token.split('.')
      const tamperedToken = `${parts[0]}.eyJzdWIiOiJ0YW1wZXJlZCJ9.${parts[2]}`

      const decodedClaims = decodeJWT(tamperedToken)
      expect(decodedClaims).toBeNull()
    })
  })

  describe('Token Format', () => {
    it('should have valid JWT structure (header.payload.signature)', () => {
      const token = generateTokenPair('user-id', 'user@example.com', 'tenant-id', 'admin')
        .accessToken

      const parts = token.split('.')
      expect(parts).toHaveLength(3)

      // Decode header
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
      expect(header.alg).toBe('HS256')
      expect(header.typ).toBe('JWT')
    })

    it('should include required claims in token payload', () => {
      const token = generateTokenPair('user-id', 'user@example.com', 'tenant-id', 'admin')
        .accessToken

      const claims = decodeJWT(token)
      expect(claims).toHaveProperty('sub', 'user-id')
      expect(claims).toHaveProperty('email', 'user@example.com')
      expect(claims).toHaveProperty('tenantId', 'tenant-id')
      expect(claims).toHaveProperty('role', 'admin')
      expect(claims).toHaveProperty('iat')
      expect(claims).toHaveProperty('exp')
    })
  })

  describe('Token Expiration', () => {
    it('access token should expire in 1 hour', () => {
      const beforeTime = Math.floor(Date.now() / 1000)
      const token = generateTokenPair('user-id', 'user@example.com', 'tenant-id', 'admin')
        .accessToken
      const afterTime = Math.floor(Date.now() / 1000)

      const claims = decodeJWT(token)
      expect(claims?.exp).toBeGreaterThanOrEqual(beforeTime + 3599)
      expect(claims?.exp).toBeLessThanOrEqual(afterTime + 3601)
    })

    it('refresh token should expire in 7 days', () => {
      const beforeTime = Math.floor(Date.now() / 1000)
      const token = generateTokenPair('user-id', 'user@example.com', 'tenant-id', 'admin')
        .refreshToken
      const afterTime = Math.floor(Date.now() / 1000)

      const claims = decodeJWT(token)
      const sevenDaysInSeconds = 7 * 24 * 60 * 60
      expect(claims?.exp).toBeGreaterThanOrEqual(beforeTime + sevenDaysInSeconds - 1)
      expect(claims?.exp).toBeLessThanOrEqual(afterTime + sevenDaysInSeconds + 1)
    })
  })

  describe('Multi-tenant Isolation', () => {
    it('should maintain tenant isolation across token pairs', () => {
      const token1 = generateTokenPair('user-1', 'user1@example.com', 'tenant-A', 'admin')
        .accessToken
      const token2 = generateTokenPair('user-2', 'user2@example.com', 'tenant-B', 'viewer')
        .accessToken

      const claims1 = decodeJWT(token1)
      const claims2 = decodeJWT(token2)

      expect(claims1?.tenantId).toBe('tenant-A')
      expect(claims2?.tenantId).toBe('tenant-B')
      expect(claims1?.sub).not.toBe(claims2?.sub)
    })
  })

  describe('Role Preservation', () => {
    it('should preserve role through token generation and decoding', () => {
      const roles = ['admin', 'editor', 'viewer'] as const

      for (const role of roles) {
        const token = generateTokenPair('user-id', 'user@example.com', 'tenant-id', role)
          .accessToken

        const claims = decodeJWT(token)
        expect(claims?.role).toBe(role)
      }
    })
  })
})
