/**
 * Client-side auth utilities and hooks
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { User } from './auth-types'

interface AuthState {
  user: User | null
  isLoading: boolean
  error: string | null
}

function decodeJWT(token: string): any | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    return payload
  } catch {
    return null
  }
}

function getTokenExpiryTime(token: string): number | null {
  const payload = decodeJWT(token)
  return payload?.exp ? payload.exp * 1000 : null
}

export function useAuth(): AuthState & {
  logout: () => void
  isAuthenticated: boolean
  refreshToken: () => Promise<boolean>
} {
  const navigate = useNavigate()
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    error: null,
  })

  // Auto-refresh token before expiration
  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const refreshTokenValue = localStorage.getItem('refreshToken')
      if (!refreshTokenValue) {
        return false
      }

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshTokenValue }),
      })

      if (!response.ok) {
        throw new Error('Token refresh failed')
      }

      const data = await response.json()
      const { tokens, user } = data

      setAuthTokens(tokens.accessToken, tokens.refreshToken)
      localStorage.setItem('user', JSON.stringify(user))
      setState({
        user,
        isLoading: false,
        error: null,
      })

      return true
    } catch (error) {
      console.error('Token refresh error:', error)
      clearAuthTokens()
      setState({
        user: null,
        isLoading: false,
        error: 'Token refresh failed',
      })
      navigate({ to: '/login' })
      return false
    }
  }, [navigate])

  useEffect(() => {
    // Check if user is already logged in (from localStorage)
    const userJson = localStorage.getItem('user')
    if (userJson) {
      try {
        const user = JSON.parse(userJson)
        setState({
          user,
          isLoading: false,
          error: null,
        })
      } catch (error) {
        setState({
          user: null,
          isLoading: false,
          error: 'Invalid user data',
        })
      }
    } else {
      setState({
        user: null,
        isLoading: false,
        error: null,
      })
    }
  }, [])

  // Set up auto-refresh interval (refresh 5 minutes before expiration)
  useEffect(() => {
    const accessToken = localStorage.getItem('accessToken')
    if (!accessToken) return

    const expiryTime = getTokenExpiryTime(accessToken)
    if (!expiryTime) return

    const now = Date.now()
    const refreshTime = expiryTime - 5 * 60 * 1000 // 5 minutes before expiry

    if (refreshTime <= now) {
      // Token expires soon, refresh immediately
      refreshToken()
    } else {
      // Schedule refresh
      const timeUntilRefresh = refreshTime - now
      const intervalId = setTimeout(() => {
        refreshToken()
      }, timeUntilRefresh)

      return () => clearTimeout(intervalId)
    }
  }, [refreshToken])

  const logout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    setState({
      user: null,
      isLoading: false,
      error: null,
    })
    navigate({ to: '/login' })
  }

  return {
    ...state,
    logout,
    isAuthenticated: !!state.user,
    refreshToken,
  }
}

export function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('accessToken')
  if (!token) {
    return {}
  }
  return {
    Authorization: `Bearer ${token}`,
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem('accessToken')
}

export function setAuthTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken)
  localStorage.setItem('refreshToken', refreshToken)
}

export function clearAuthTokens() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
}
