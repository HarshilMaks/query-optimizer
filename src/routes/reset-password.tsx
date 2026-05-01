import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, FormEvent, useEffect } from 'react'

export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: search.token as string | undefined,
  }),
})

function ResetPasswordPage() {
  const navigate = useNavigate()
  const { token } = useSearch({ from: Route.id })
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [tokenValid, setTokenValid] = useState(true)
  const [passwordValidation, setPasswordValidation] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
  })

  // Validate token format
  useEffect(() => {
    if (!token || token.length < 20) {
      setTokenValid(false)
    }
  }, [token])

  // Check password requirements as user types
  useEffect(() => {
    setPasswordValidation({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
    })
  }, [password])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!token) {
      setError('Invalid reset token')
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    const allValid = Object.values(passwordValidation).every((v) => v)
    if (!allValid) {
      setError('Password does not meet all requirements')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'An error occurred')
        return
      }

      setSuccess(true)

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate({ to: '/login' })
      }, 3000)
    } catch (err) {
      setError('Failed to reset password. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Invalid Reset Link</h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
          </div>
          <button
            onClick={() => navigate({ to: '/forgot-password' })}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700"
          >
            Request New Reset Link
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Reset Password</h1>
        <p className="text-gray-600 mb-6">Enter your new password below.</p>

        {success ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-800">
              ✓ Password reset successfully! You can now log in with your new password.
            </p>
            <p className="text-sm text-green-700 mt-2">
              Redirecting to login in 3 seconds...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="mt-3 space-y-2">
                <PasswordRequirement
                  met={passwordValidation.length}
                  text="At least 8 characters"
                />
                <PasswordRequirement
                  met={passwordValidation.uppercase}
                  text="One uppercase letter (A-Z)"
                />
                <PasswordRequirement
                  met={passwordValidation.lowercase}
                  text="One lowercase letter (a-z)"
                />
                <PasswordRequirement
                  met={passwordValidation.number}
                  text="One number (0-9)"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-red-600 text-sm mt-1">Passwords do not match</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                !Object.values(passwordValidation).every((v) => v) ||
                password !== confirmPassword
              }
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            Remember your password?{' '}
            <button
              onClick={() => navigate({ to: '/login' })}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Back to login
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-lg ${met ? 'text-green-600' : 'text-gray-400'}`}>
        {met ? '✓' : '○'}
      </span>
      <span className={`text-sm ${met ? 'text-green-700' : 'text-gray-600'}`}>
        {text}
      </span>
    </div>
  )
}
