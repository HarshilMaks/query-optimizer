/**
 * Email Verification Utilities
 * Handles verification code generation, validation, and email templates
 */

import crypto from 'crypto'

interface VerificationCode {
  code: string
  email: string
  expiresAt: number
  attempts: number
}

// Store verification codes (key = email, value = VerificationCode)
// In production, this should be persisted to database/KV store
const verificationCodes = new Map<string, VerificationCode>()

const CODE_LENGTH = 6 // 6-digit code
const CODE_EXPIRY_MINUTES = 15 // 15 minute expiration
const MAX_ATTEMPTS = 5 // Max 5 verification attempts
const RESEND_COOLDOWN_SECONDS = 60 // Wait 60 seconds between resends

// Track resend cooldown (key = email, value = lastSentTimestamp)
const resendCooldown = new Map<string, number>()

/**
 * Generate a random 6-digit verification code
 */
export function generateVerificationCode(): string {
  const code = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(CODE_LENGTH, '0')
  return code
}

/**
 * Create and store verification code for email
 * Returns the code (for testing/dev) and the obfuscated version for display
 */
export function createVerificationCode(email: string): { code: string; display: string } {
  const code = generateVerificationCode()
  const expiresAt = Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000

  verificationCodes.set(email, {
    code,
    email,
    expiresAt,
    attempts: 0,
  })

  // Return full code for backend, obfuscated for UI display
  const display = `${code.slice(0, 2)}****`
  return { code, display }
}

/**
 * Validate verification code for email
 * Returns true if valid, false if expired/invalid/too many attempts
 */
export function validateVerificationCode(email: string, code: string): boolean {
  const stored = verificationCodes.get(email)

  if (!stored) {
    return false
  }

  // Check expiration
  if (Date.now() > stored.expiresAt) {
    verificationCodes.delete(email)
    return false
  }

  // Check attempts
  if (stored.attempts >= MAX_ATTEMPTS) {
    verificationCodes.delete(email)
    return false
  }

  // Increment attempt counter
  stored.attempts += 1

  // Check code match (case insensitive for user convenience)
  const match = stored.code === code.trim()

  if (match) {
    // Success - delete code
    verificationCodes.delete(email)
    return true
  }

  return false
}

/**
 * Get remaining attempts for email
 */
export function getVerificationAttempts(email: string): number {
  const stored = verificationCodes.get(email)
  if (!stored) {
    return MAX_ATTEMPTS
  }

  const remaining = MAX_ATTEMPTS - stored.attempts
  return Math.max(0, remaining)
}

/**
 * Check if resend is allowed (cooldown check)
 * Returns { allowed: boolean, retryAfter: seconds }
 */
export function canResendCode(email: string): { allowed: boolean; retryAfter: number } {
  const lastSent = resendCooldown.get(email)
  if (!lastSent) {
    return { allowed: true, retryAfter: 0 }
  }

  const secondsElapsed = (Date.now() - lastSent) / 1000
  if (secondsElapsed >= RESEND_COOLDOWN_SECONDS) {
    return { allowed: true, retryAfter: 0 }
  }

  const retryAfter = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsElapsed)
  return { allowed: false, retryAfter }
}

/**
 * Mark resend time for email
 */
export function recordResendAttempt(email: string): void {
  resendCooldown.set(email, Date.now())
}

/**
 * Get verification code details for testing
 */
export function getVerificationStatus(email: string): VerificationCode | null {
  return verificationCodes.get(email) ?? null
}

/**
 * Clear verification code (for testing)
 */
export function clearVerificationCode(email: string): void {
  verificationCodes.delete(email)
}

/**
 * Clean up expired verification codes
 * Call this periodically to prevent memory leaks
 */
export function cleanupExpiredCodes(maxAge: number = 3600000): void {
  // 1 hour default
  const now = Date.now()
  let cleaned = 0

  for (const [email, code] of verificationCodes.entries()) {
    if (now > code.expiresAt + maxAge) {
      verificationCodes.delete(email)
      cleaned++
    }
  }

  if (cleaned > 0) {
    console.log(`[Email Verification] Cleaned up ${cleaned} expired codes`)
  }
}

/**
 * Email verification template (HTML)
 */
export function getVerificationEmailHTML(email: string, code: string, appName: string = 'QuerySage'): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background: #f9f9f9; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { padding: 30px; }
    .code-box { background: #f5f5f5; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .code { font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #667eea; font-family: 'Courier New', monospace; }
    .footer { background: #f9f9f9; border-top: 1px solid #eee; padding: 20px; text-align: center; font-size: 12px; color: #666; }
    a { color: #667eea; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Verify Your Email</h1>
    </div>
    
    <div class="content">
      <p>Hi,</p>
      
      <p>You signed up for ${appName}. To complete your registration and verify your email address, please enter this code:</p>
      
      <div class="code-box">
        <div class="code">${code}</div>
      </div>
      
      <p style="color: #888; font-size: 14px;">This code expires in 15 minutes.</p>
      
      <p style="margin-top: 30px; color: #666;">If you didn't create this account, you can safely ignore this email.</p>
      
      <p>Questions? Reply to this email or visit our <a href="https://querysage.io/help">help center</a>.</p>
      
      <p>Best regards,<br><strong>${appName} Team</strong></p>
    </div>
    
    <div class="footer">
      <p>${appName} © 2024 | <a href="https://querysage.io">querysage.io</a></p>
      <p>This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Email verification template (Plain text)
 */
export function getVerificationEmailText(email: string, code: string, appName: string = 'QuerySage'): string {
  return `
Verify Your Email Address

Hi,

You signed up for ${appName}. To complete your registration and verify your email address, please enter this code:

${code}

This code expires in 15 minutes.

If you didn't create this account, you can safely ignore this email.

Questions? Reply to this email or visit our help center at https://querysage.io/help

Best regards,
The ${appName} Team

---
This is an automated email. Please do not reply.
${appName} © 2024 | https://querysage.io
  `.trim()
}

/**
 * Send verification email (currently mocked, logs to console)
 * In production, integrate with Sendgrid, Mailgun, or Resend API
 */
export async function sendVerificationEmail(
  email: string,
  code: string,
  appName: string = 'QuerySage'
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const htmlContent = getVerificationEmailHTML(email, code, appName)
    const textContent = getVerificationEmailText(email, code, appName)

    // Log to console (mocked)
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 VERIFICATION EMAIL (MOCKED - DEV ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${email}
Subject: Verify Your Email Address - ${appName}

${textContent}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `)

    // TODO: Integrate real email service
    // const response = await resend.emails.send({
    //   from: 'noreply@querysage.io',
    //   to: email,
    //   subject: 'Verify Your Email Address',
    //   html: htmlContent,
    //   text: textContent,
    // });

    return {
      success: true,
      messageId: `mock-${Date.now()}`,
    }
  } catch (err) {
    console.error('Failed to send verification email:', err)
    return {
      success: false,
      error: 'Failed to send verification email',
    }
  }
}

/**
 * Verify email verification token (alternative to code-based)
 * Not currently used, but available for email link clicks
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Get verification statistics (for debugging)
 */
export function getVerificationStats(): {
  totalPending: number
  avgAttemptsRemaining: number
  oldestCodeAge: number
} {
  const now = Date.now()
  const codes = Array.from(verificationCodes.values())

  const totalPending = codes.length
  const avgAttempts = codes.length > 0 ? codes.reduce((sum, c) => sum + (MAX_ATTEMPTS - c.attempts), 0) / codes.length : 0
  const oldestCode = codes.length > 0 ? Math.max(...codes.map(c => now - c.expiresAt)) : 0

  return {
    totalPending,
    avgAttemptsRemaining: Math.round(avgAttempts * 100) / 100,
    oldestCodeAge: Math.round(oldestCode / 1000), // seconds
  }
}
