/**
 * GitHub OAuth Start
 * Initiates OAuth flow by redirecting to GitHub
 */

import type { Context } from '@netlify/functions'
import { generateCodeVerifier, generateCodeChallenge, generateState, buildGitHubAuthUrl, createOAuthState } from './lib/oauth.js'
import { json, errorResponse } from './lib/auth.js'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID
    const GITHUB_OAUTH_REDIRECT_URL = process.env.GITHUB_OAUTH_REDIRECT_URL

    if (!GITHUB_CLIENT_ID || !GITHUB_OAUTH_REDIRECT_URL) {
      console.error('[OAuth] Missing GitHub OAuth configuration')
      return errorResponse('OAuth not configured', 500)
    }

    // Generate PKCE pair
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    // Generate CSRF state
    const state = generateState()

    // Create OAuth state object (store in session)
    const oauthState = createOAuthState(codeVerifier, state)

    // Build GitHub auth URL
    const githubAuthUrl = buildGitHubAuthUrl(
      GITHUB_CLIENT_ID,
      GITHUB_OAUTH_REDIRECT_URL,
      codeChallenge,
      state
    )

    // Return auth URL and state (state should be stored in cookie/session on frontend)
    return json({
      authUrl: githubAuthUrl,
      state: oauthState.state,
      createdAt: oauthState.createdAt,
    })
  } catch (error) {
    console.error('[OAuth Start Error]', error)
    return errorResponse('OAuth initialization failed', 500)
  }
}
