/**
 * OAuth Utilities
 * Handles PKCE, state generation, and GitHub OAuth flows
 */

import crypto from 'crypto'

/**
 * Generate PKCE code verifier (RFC 7636)
 * Creates a random 128-character string
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(96).toString('base64url')
}

/**
 * Generate PKCE code challenge from verifier
 * SHA256 hash of the verifier
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url')
}

/**
 * Generate CSRF state parameter
 * Random 32-byte string
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Build GitHub OAuth authorization URL
 */
export function buildGitHubAuthUrl(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string,
  scopes: string[] = ['user:email', 'read:user']
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    allow_signup: 'true',
  })

  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<{ access_token: string; token_type: string; scope: string }> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`GitHub OAuth error: ${error.error_description || error.error}`)
  }

  return response.json()
}

/**
 * Fetch user profile from GitHub API
 */
export async function fetchGitHubUser(accessToken: string): Promise<{
  id: number
  login: string
  name: string | null
  email: string | null
  avatar_url: string
  bio: string | null
}> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`GitHub API error: ${error.message}`)
  }

  return response.json()
}

/**
 * Validate PKCE state parameter
 */
export function validateState(storedState: string, returnedState: string): boolean {
  return storedState === returnedState
}

/**
 * Store PKCE values in secure session
 * Returns object to be stored in cookie/session
 */
export function createOAuthState(verifier: string, state: string): {
  verifier: string
  state: string
  createdAt: number
} {
  return {
    verifier,
    state,
    createdAt: Date.now(),
  }
}

/**
 * Validate OAuth state hasn't expired (15 min)
 */
export function isOAuthStateValid(oauthState: { createdAt: number }): boolean {
  const OAUTH_STATE_MAX_AGE = 15 * 60 * 1000 // 15 minutes
  return Date.now() - oauthState.createdAt < OAUTH_STATE_MAX_AGE
}
