/**
 * GitHub OAuth Callback
 * Handles OAuth code exchange and user creation/linking
 */

import type { Context } from '@netlify/functions'
import {
  exchangeCodeForToken,
  fetchGitHubUser,
  validateState,
  isOAuthStateValid,
} from './lib/oauth.js'
import { generateTokenPair, json, errorResponse } from './lib/auth.js'
import { getUserByGitHubId, createUser, createSession, getUserByEmail } from './lib/db.js'
import { appendAuditEvent } from './lib/audit.js'
import { getRequestIdentifier, getRequestContext } from './lib/request-context.js'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    // Handle GitHub OAuth errors
    if (error) {
      console.error(`[OAuth Error] ${error}: ${errorDescription}`)
      const redirectUrl = new URL('http://localhost:3000/signin')
      redirectUrl.searchParams.set('error', `oauth_error_${error}`)
      if (errorDescription) redirectUrl.searchParams.set('error_desc', errorDescription)
      return {
        statusCode: 302,
        headers: { Location: redirectUrl.toString() },
        body: '',
      }
    }

    if (!code || !state) {
      return errorResponse('Missing code or state', 400)
    }

    const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID
    const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET
    const GITHUB_OAUTH_REDIRECT_URL = process.env.GITHUB_OAUTH_REDIRECT_URL

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !GITHUB_OAUTH_REDIRECT_URL) {
      return errorResponse('OAuth not configured', 500)
    }

    // TODO: Validate state from frontend session/cookie
    // For now, accept all states (security TODO)
    // In production: retrieve stored state from session/cookie and validate

    // Get PKCE verifier from frontend (should be in request body or secure cookie)
    // For now, we're assuming frontend provides it
    // TODO: Implement proper session storage for PKCE verifier

    // Placeholder: In real implementation, get from session storage
    const codeVerifier = url.searchParams.get('code_verifier') || ''

    // Exchange code for token
    let accessToken: string
    try {
      const tokenResponse = await exchangeCodeForToken(
        GITHUB_CLIENT_ID,
        GITHUB_CLIENT_SECRET,
        code,
        GITHUB_OAUTH_REDIRECT_URL,
        codeVerifier
      )
      accessToken = tokenResponse.access_token
    } catch (error) {
      console.error('[OAuth Token Exchange Error]', error)
      const redirectUrl = new URL('http://localhost:3000/signin')
      redirectUrl.searchParams.set('error', 'token_exchange_failed')
      return {
        statusCode: 302,
        headers: { Location: redirectUrl.toString() },
        body: '',
      }
    }

    // Fetch GitHub user profile
    let githubUser
    try {
      githubUser = await fetchGitHubUser(accessToken)
    } catch (error) {
      console.error('[OAuth User Fetch Error]', error)
      const redirectUrl = new URL('http://localhost:3000/signin')
      redirectUrl.searchParams.set('error', 'profile_fetch_failed')
      return {
        statusCode: 302,
        headers: { Location: redirectUrl.toString() },
        body: '',
      }
    }

    const context = getRequestContext(req)

    // Check if user exists by GitHub ID
    let user = await getUserByGitHubId(githubUser.id)

    if (!user) {
      // Check if user exists by email
      if (githubUser.email) {
        user = await getUserByEmail(githubUser.email)
      }
    }

    if (user) {
      // Link GitHub account to existing user
      if (!user.github_id) {
        // Update user with GitHub info
        // TODO: Implement update user with GitHub ID
        console.log(`[OAuth] Linked GitHub account to existing user: ${user.id}`)
      }
    } else {
      // Create new user
      if (!githubUser.email) {
        const redirectUrl = new URL('http://localhost:3000/signin')
        redirectUrl.searchParams.set('error', 'no_email')
        redirectUrl.searchParams.set(
          'error_desc',
          'Please make your email public on GitHub'
        )
        return {
          statusCode: 302,
          headers: { Location: redirectUrl.toString() },
          body: '',
        }
      }

      user = await createUser({
        email: githubUser.email,
        passwordHash: '', // OAuth users don't have password
        fullName: githubUser.name || githubUser.login,
        tenantId: 'default',
        roles: ['viewer'],
        githubId: githubUser.id,
        githubUsername: githubUser.login,
        githubAvatarUrl: githubUser.avatar_url,
      })

      console.log(`[OAuth] Created new user from GitHub: ${user.id}`)
    }

    // Create session
    const session = await createSession(user.id, user.tenant_id, {
      ipAddress: getRequestIdentifier(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
    })

    // Generate tokens
    const tokens = generateTokenPair(user.id, user.email, user.tenant_id, user.roles[0])

    // Audit log
    await appendAuditEvent({
      userId: user.id,
      tenantId: user.tenant_id,
      action: 'login',
      resourceType: 'auth',
      resourceId: 'github_oauth',
      newValue: {
        githubId: githubUser.id,
        githubLogin: githubUser.login,
      },
      ipAddress: getRequestIdentifier(req),
      userAgent: req.headers.get('user-agent'),
    })

    // Redirect to dashboard with tokens in query params
    // TODO: In production, use secure httpOnly cookies or session storage
    const redirectUrl = new URL('http://localhost:3000/dashboard')
    redirectUrl.searchParams.set('accessToken', tokens.accessToken)
    redirectUrl.searchParams.set('refreshToken', tokens.refreshToken)
    redirectUrl.searchParams.set('userId', user.id)

    return {
      statusCode: 302,
      headers: { Location: redirectUrl.toString() },
      body: '',
    }
  } catch (error) {
    console.error('[OAuth Callback Error]', error)
    const redirectUrl = new URL('http://localhost:3000/signin')
    redirectUrl.searchParams.set('error', 'internal_error')
    return {
      statusCode: 302,
      headers: { Location: redirectUrl.toString() },
      body: '',
    }
  }
}
