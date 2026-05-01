/**
 * Password Reset Utilities
 * Handles password reset token generation, validation, and email sending
 */

import crypto from 'crypto'

const RESET_TOKEN_EXPIRY = 15 * 60 * 1000 // 15 minutes in milliseconds
const RESET_TOKEN_LENGTH = 32

interface ResetTokenData {
  email: string
  token: string
  expiresAt: number
}

// Store reset tokens in memory (in production, use database)
const resetTokens = new Map<string, ResetTokenData>()

/**
 * Generate a password reset token
 */
export function generateResetToken(email: string): string {
  const token = crypto.randomBytes(RESET_TOKEN_LENGTH).toString('hex')
  const expiresAt = Date.now() + RESET_TOKEN_EXPIRY

  resetTokens.set(token, {
    email,
    token,
    expiresAt,
  })

  // Clean up expired tokens
  for (const [key, data] of resetTokens.entries()) {
    if (data.expiresAt < Date.now()) {
      resetTokens.delete(key)
    }
  }

  return token
}

/**
 * Validate a reset token and return email
 */
export function validateResetToken(token: string): string | null {
  const data = resetTokens.get(token)

  if (!data) {
    return null
  }

  if (data.expiresAt < Date.now()) {
    resetTokens.delete(token)
    return null
  }

  return data.email
}

/**
 * Invalidate a reset token after use
 */
export function invalidateResetToken(token: string): void {
  resetTokens.delete(token)
}

/**
 * Email templates
 */
export function getPasswordResetEmailTemplate(email: string, resetLink: string): {
  subject: string
  html: string
  text: string
} {
  return {
    subject: 'Reset Your Password - QuerySage',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f5f5f5; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .button { 
              display: inline-block;
              background-color: #007bff;
              color: white;
              padding: 12px 24px;
              border-radius: 4px;
              text-decoration: none;
              margin: 20px 0;
            }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .warning { color: #d9534f; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Password Reset Request</h2>
            </div>
            <div class="content">
              <p>Hi ${email.split('@')[0]},</p>
              
              <p>We received a request to reset your password. Click the link below to create a new password:</p>
              
              <a href="${resetLink}" class="button">Reset Password</a>
              
              <p>Or copy and paste this link in your browser:</p>
              <p style="word-break: break-all; background-color: #f5f5f5; padding: 10px;">
                ${resetLink}
              </p>
              
              <p><strong>This link will expire in 15 minutes.</strong></p>
              
              <p class="warning">⚠️ If you didn't request this reset, you can safely ignore this email. Your password will not change.</p>
              
              <p>Security tip: Never share your password reset link with anyone.</p>
            </div>
            <div class="footer">
              <p>&copy; QuerySage. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Password Reset Request

Hi ${email.split('@')[0]},

We received a request to reset your password. Visit this link to create a new password:

${resetLink}

This link will expire in 15 minutes.

⚠️ If you didn't request this reset, you can safely ignore this email. Your password will not change.

Security tip: Never share your password reset link with anyone.

© QuerySage. All rights reserved.
    `.trim(),
  }
}

/**
 * Mock email sending (logs to console)
 * In production, integrate with SendGrid, Mailgun, or Netlify Email API
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  baseUrl: string
): Promise<{ success: boolean; message: string }> {
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`
  const emailTemplate = getPasswordResetEmailTemplate(email, resetLink)

  // Mock: Log to console
  console.log('📧 Password Reset Email')
  console.log(`To: ${email}`)
  console.log(`Subject: ${emailTemplate.subject}`)
  console.log(`\nReset Link: ${resetLink}`)
  console.log(`\n${emailTemplate.text}`)

  // TODO: In production, integrate with actual email service:
  // const response = await sendgrid.send({
  //   to: email,
  //   from: 'noreply@querysage.com',
  //   subject: emailTemplate.subject,
  //   html: emailTemplate.html,
  // })

  return {
    success: true,
    message: `Password reset email sent to ${email} (check console in dev mode)`,
  }
}

/**
 * Password validation rules
 */
export function validatePassword(password: string): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters')
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter')
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter')
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain a number')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
