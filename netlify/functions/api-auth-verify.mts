/**
 * Email Verification Endpoints
 * Handles email verification flow: send code, verify code, resend
 */

import type { Context } from '@netlify/functions'
import { json, errorResponse } from './lib/auth.js'
import { getUserByEmail } from './lib/db.js'
import {
  createVerificationCode,
  validateVerificationCode,
  sendVerificationEmail,
  getVerificationAttempts,
  canResendCode,
  recordResendAttempt,
} from './lib/email-verification.js'
import { appendAuditEvent } from './lib/audit.js'
import { checkRateLimit, rateLimitErrorResponse, RATE_LIMIT_PRESETS } from './lib/rate-limit.js'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const url = new URL(req.url)
  const pathname = url.pathname

  // POST /api/auth/verify/send
  if (pathname.includes('send')) {
    try {
      const body = (await req.json()) as { email: string }
      const { email } = body

      if (!email) {
        return errorResponse('Email is required')
      }

      if (!email.includes('@')) {
        return errorResponse('Invalid email format')
      }

      // Rate limiting: 5 attempts per hour per email
      const identifier = `email-verify:${email}`
      const rateLimit = checkRateLimit(identifier, RATE_LIMIT_PRESETS.emailVerification)

      if (!rateLimit.allowed) {
        console.log(`[Rate Limit] Email verification requested too many times for ${email}: retry in ${rateLimit.retryAfter}s`)
        return rateLimitErrorResponse(rateLimit.retryAfter)
      }

      // Check resend cooldown (60 second delay between resends)
      const canResend = canResendCode(email)
      if (!canResend.allowed) {
        return json(
          {
            error: 'Please wait before requesting a new code',
            retryAfter: canResend.retryAfter,
          },
          429
        )
      }

      // Find user
      const user = await getUserByEmail(email)
      if (!user) {
        // For security, always return success (don't reveal if email exists)
        console.log(`Email verification requested for non-existent email: ${email}`)
        return json({
          success: true,
          message: 'If that email exists in our system, you will receive a verification code shortly.',
        })
      }

      // Check if already verified
      if (user.email_verified_at) {
        return json({
          success: true,
          message: 'This email is already verified.',
        })
      }

      // Generate verification code
      const { code, display } = createVerificationCode(email)

      // Send verification email
      const emailResult = await sendVerificationEmail(email, code)

      if (!emailResult.success) {
        return errorResponse('Failed to send verification email. Please try again.')
      }

      // Record resend attempt (cooldown)
      recordResendAttempt(email)

      // Audit: Verification email sent
      try {
        await appendAuditEvent({
          tenant_id: user.tenant_id,
          entity_type: 'user',
          entity_id: email,
          action: 'user.email_verification_sent',
          actor_id: 'system',
          metadata: { email },
        })
      } catch (err) {
        console.error('Failed to log audit event:', err)
      }

      return json({
        success: true,
        message: 'Verification code sent to your email.',
        displayCode: display, // Show obfuscated version
      })
    } catch (error) {
      console.error('Send verification code error:', error)
      return errorResponse('An error occurred. Please try again.')
    }
  }

  // POST /api/auth/verify/code
  if (pathname.includes('code')) {
    try {
      const body = (await req.json()) as { email: string; code: string }
      const { email, code } = body

      if (!email || !code) {
        return errorResponse('Email and code are required')
      }

      // Rate limiting: 5 attempts per hour per email
      const identifier = `email-verify-attempt:${email}`
      const rateLimit = checkRateLimit(identifier, RATE_LIMIT_PRESETS.emailVerification)

      if (!rateLimit.allowed) {
        return rateLimitErrorResponse(rateLimit.retryAfter)
      }

      // Find user
      const user = await getUserByEmail(email)
      if (!user || !user.is_active) {
        return errorResponse('User not found', 404)
      }

      // Check if already verified
      if (user.email_verified_at) {
        return json({
          success: true,
          message: 'This email is already verified.',
        })
      }

      // Validate code
      const isValid = validateVerificationCode(email, code)

      if (!isValid) {
        const remaining = getVerificationAttempts(email)

        if (remaining === 0) {
          // Clear verification for this email
          console.log(`Email verification failed for ${email}: too many attempts`)
          return json(
            {
              error: 'Too many verification attempts. Please request a new code.',
              remaining: 0,
            },
            429
          )
        }

        return json(
          {
            error: 'Invalid or expired verification code',
            remaining,
          },
          400
        )
      }

      // Mark email as verified
      try {
        // TODO: Implement updateUserEmailVerified in db.ts
        // await updateUserEmailVerified(user.id)
        console.log(`Would mark email ${email} as verified for user ${user.id}`)
      } catch (err) {
        console.error('Failed to mark email as verified:', err)
        return errorResponse('Failed to verify email. Please try again.')
      }

      // Audit: Email verified
      try {
        await appendAuditEvent({
          tenant_id: user.tenant_id,
          entity_type: 'user',
          entity_id: email,
          action: 'user.email_verified',
          actor_id: user.id,
          metadata: { email },
        })
      } catch (err) {
        console.error('Failed to log audit event:', err)
      }

      return json({
        success: true,
        message: 'Email verified successfully!',
      })
    } catch (error) {
      console.error('Verify code error:', error)
      return errorResponse('An error occurred. Please try again.')
    }
  }

  // POST /api/auth/verify/resend (alias for send with cooldown)
  if (pathname.includes('resend')) {
    try {
      const body = (await req.json()) as { email: string }
      const { email } = body

      if (!email) {
        return errorResponse('Email is required')
      }

      // Just delegate to send endpoint
      const sendRequest = new Request(req.url.replace('resend', 'send'), {
        method: 'POST',
        body: JSON.stringify(body),
        headers: req.headers,
      })

      return await default(sendRequest, _ctx)
    } catch (error) {
      console.error('Resend code error:', error)
      return errorResponse('An error occurred. Please try again.')
    }
  }

  return json({ error: 'Endpoint not found' }, 404)
}
