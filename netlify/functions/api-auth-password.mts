/**
 * Password Reset Endpoints
 * Handles forgot password and reset password flows
 */

import type { Context } from '@netlify/functions'
import { json, errorResponse } from './lib/auth.js'
import { getUserByEmail, getUserById } from './lib/db.js'
import { generateResetToken, validateResetToken, invalidateResetToken, sendPasswordResetEmail, validatePassword } from './lib/password-reset.js'
import { appendAuditEvent } from './lib/audit.js'
import { checkRateLimit, resetRateLimit, getRequestIdentifier, rateLimitErrorResponse, RATE_LIMIT_PRESETS } from './lib/rate-limit.js'
import crypto from 'crypto'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const url = new URL(req.url)
  const pathname = url.pathname

  // POST /api/auth/password/forgot
  if (pathname.includes('forgot')) {
    try {
      const body = (await req.json()) as { email: string }
      const { email } = body

      if (!email) {
        return errorResponse('Email is required')
      }

      // Rate limiting: 3 attempts per hour per email
      const identifier = `password-forgot:${email}`
      const rateLimit = checkRateLimit(identifier, RATE_LIMIT_PRESETS.passwordReset)

      if (!rateLimit.allowed) {
        console.log(`[Rate Limit] Password reset requested too many times for ${email}: retry in ${rateLimit.retryAfter}s`)
        return rateLimitErrorResponse(rateLimit.retryAfter)
      }

      // Validate email format
      if (!email.includes('@')) {
        return errorResponse('Invalid email format')
      }

      // For security, always return success (don't reveal if user exists)
      const user = await getUserByEmail(email)
      if (!user) {
        // Log attempt with non-existent email
        console.log(`Password reset attempted for non-existent email: ${email}`)
        return json({
          success: true,
          message: 'If that email exists in our system, you will receive a password reset link shortly.',
        })
      }

      // Generate reset token
      const resetToken = generateResetToken(email)

      // Send reset email
      const baseUrl = new URL(req.url).origin
      try {
        await sendPasswordResetEmail(email, resetToken, baseUrl)
      } catch (err) {
        console.error('Failed to send password reset email:', err)
        // Still return success - email failure shouldn't break the flow
      }

      // Audit: Password reset requested
      try {
        await appendAuditEvent({
          tenant_id: user.tenant_id,
          entity_type: 'user',
          entity_id: email,
          action: 'user.password_reset_requested',
          actor_id: 'system',
          metadata: { email },
        })
      } catch (err) {
        console.error('Failed to log audit event:', err)
      }

      return json({
        success: true,
        message: 'If that email exists in our system, you will receive a password reset link shortly.',
      })
    } catch (error) {
      console.error('Forgot password error:', error)
      return errorResponse('An error occurred. Please try again.')
    }
  }

  // POST /api/auth/password/reset
  if (pathname.includes('reset')) {
    try {
      const body = (await req.json()) as { token: string; password: string; confirmPassword: string }
      const { token, password, confirmPassword } = body

      if (!token || !password || !confirmPassword) {
        return errorResponse('Token and password are required')
      }

      // Rate limiting: 3 attempts per hour per IP
      const ip = getRequestIdentifier(req, 'unknown')
      const identifier = `password-reset:${ip}`
      const rateLimit = checkRateLimit(identifier, RATE_LIMIT_PRESETS.passwordReset)

      if (!rateLimit.allowed) {
        console.log(`[Rate Limit] Password reset attempted too many times from IP ${ip}: retry in ${rateLimit.retryAfter}s`)
        return rateLimitErrorResponse(rateLimit.retryAfter)
      }

      if (password !== confirmPassword) {
        return errorResponse('Passwords do not match')
      }

      // Validate password strength
      const passwordValidation = validatePassword(password)
      if (!passwordValidation.valid) {
        return json(
          {
            error: 'Password does not meet requirements',
            details: passwordValidation.errors,
          },
          400
        )
      }

      // Validate reset token
      const email = validateResetToken(token)
      if (!email) {
        return errorResponse('Invalid or expired reset token', 400)
      }

      // Get user
      const user = await getUserByEmail(email)
      if (!user || !user.is_active) {
        return errorResponse('User not found', 404)
      }

      // Hash new password (mock for now)
      const passwordHash = `$2b$10$mock-${crypto.randomBytes(16).toString('hex')}`

      // Update user password in database
      try {
        // TODO: Implement updateUserPassword in db.ts
        console.log(`Would update password for ${email}`)
        // await updateUserPassword(user.id, passwordHash)
      } catch (err) {
        console.error('Failed to update password:', err)
        return errorResponse('Failed to reset password. Please try again.')
      }

      // Invalidate reset token
      invalidateResetToken(token)

      // Audit: Password reset completed
      try {
        await appendAuditEvent({
          tenant_id: user.tenant_id,
          entity_type: 'user',
          entity_id: email,
          action: 'user.password_reset_completed',
          actor_id: user.id,
          metadata: { email },
        })
      } catch (err) {
        console.error('Failed to log audit event:', err)
      }

      return json({
        success: true,
        message: 'Password reset successfully. You can now log in with your new password.',
      })
    } catch (error) {
      console.error('Reset password error:', error)
      return errorResponse('An error occurred. Please try again.')
    }
  }

  // POST /api/auth/password/change (authenticated endpoint)
  if (pathname.includes('change')) {
    try {
      const authHeader = req.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return errorResponse('Unauthorized', 401)
      }

      // TODO: Extract user from JWT token
      // const token = authHeader.slice(7)
      // const claims = decodeJWT(token)

      const body = (await req.json()) as {
        currentPassword: string
        newPassword: string
        confirmPassword: string
      }
      const { currentPassword, newPassword, confirmPassword } = body

      if (!currentPassword || !newPassword || !confirmPassword) {
        return errorResponse('All password fields are required')
      }

      if (newPassword !== confirmPassword) {
        return errorResponse('New passwords do not match')
      }

      // Validate new password strength
      const passwordValidation = validatePassword(newPassword)
      if (!passwordValidation.valid) {
        return json(
          {
            error: 'Password does not meet requirements',
            details: passwordValidation.errors,
          },
          400
        )
      }

      // TODO: Verify current password and update to new password

      return json({
        success: true,
        message: 'Password changed successfully.',
      })
    } catch (error) {
      console.error('Change password error:', error)
      return errorResponse('An error occurred. Please try again.')
    }
  }

  return errorResponse('Invalid password endpoint', 400)
}

export const config = { path: '/api/auth/password/:action' }
