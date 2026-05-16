import { Resend } from 'resend'

const DEFAULT_FROM = 'QuerySage <onboarding@resend.dev>'

let resendClient: Resend | null = null

export interface TransactionalEmail {
  to: string
  subject: string
  html: string
  text: string
}

export interface EmailSendResult {
  success: boolean
  provider: 'resend' | 'console'
  messageId?: string
  error?: string
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return null
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey)
  }

  return resendClient
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM || DEFAULT_FROM
}

export async function sendTransactionalEmail(payload: TransactionalEmail): Promise<EmailSendResult> {
  const client = getResendClient()

  if (!client) {
    const missingKeyError = 'RESEND_API_KEY is not configured'
    if (process.env.NODE_ENV === 'production') {
      return {
        success: false,
        provider: 'console',
        error: missingKeyError,
      }
    }

    console.log('[Email Fallback] RESEND_API_KEY missing. Email sent to console output.')
    console.log(`To: ${payload.to}`)
    console.log(`Subject: ${payload.subject}`)
    console.log(payload.text)
    return {
      success: true,
      provider: 'console',
      messageId: `console-${Date.now()}`,
    }
  }

  const { data, error } = await client.emails.send({
    from: getFromAddress(),
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  })

  if (error) {
    return {
      success: false,
      provider: 'resend',
      error: error.message,
    }
  }

  return {
    success: true,
    provider: 'resend',
    messageId: data?.id,
  }
}
