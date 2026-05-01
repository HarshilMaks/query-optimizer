import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/login')({
  component: LoginPage,
  meta: () => [{ title: 'Login - QuerySage' }],
})

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }

      const { tokens, user } = await response.json()

      // Store tokens in localStorage
      localStorage.setItem('accessToken', tokens.accessToken)
      localStorage.setItem('refreshToken', tokens.refreshToken)
      localStorage.setItem('user', JSON.stringify(user))

      // Redirect to dashboard
      navigate({ to: '/dashboard' })
    } catch (err) {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg border border-gray-200">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">QuerySage</h1>
          <p className="text-gray-600 mt-2">Sign in to your account</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="text-center text-gray-600 text-sm mt-4">
          <button
            onClick={() => navigate({ to: '/forgot-password' })}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Forgot password?
          </button>
        </div>

        <p className="text-center text-gray-600 text-sm mt-6">
          Don't have an account?{' '}
          <button
            onClick={() => navigate({ to: '/signup' })}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Sign up
          </button>
        </p>

        <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
          <p className="font-semibold mb-1">Demo credentials:</p>
          <p>Email: user@example.com</p>
          <p>Password: password</p>
        </div>
      </div>
    </div>
  )
}
