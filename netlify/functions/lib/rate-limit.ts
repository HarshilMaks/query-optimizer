/**
 * Rate Limiting Utilities
 * Token bucket algorithm for preventing brute force attacks
 */

interface TokenBucket {
  tokens: number
  lastRefillAt: number
}

// Store rate limit buckets (key = identifier like email or IP)
const buckets = new Map<string, TokenBucket>()

const DEFAULT_CAPACITY = 10 // Max 10 requests
const DEFAULT_REFILL_RATE = 60000 // Refill every 60 seconds (1 minute)
const DEFAULT_TOKENS_PER_REFILL = 10 // Add 10 tokens every minute

/**
 * Configuration for rate limiting
 */
export interface RateLimitConfig {
  capacity?: number // Max tokens in bucket
  refillInterval?: number // How often to refill (ms)
  tokensPerRefill?: number // How many tokens to add on refill
}

/**
 * Initialize rate limiting for a specific identifier
 * Returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = {}
): { allowed: boolean; remaining: number; retryAfter: number } {
  const capacity = config.capacity ?? DEFAULT_CAPACITY
  const refillInterval = config.refillInterval ?? DEFAULT_REFILL_RATE
  const tokensPerRefill = config.tokensPerRefill ?? DEFAULT_TOKENS_PER_REFILL

  const now = Date.now()
  let bucket = buckets.get(identifier)

  // Initialize bucket if doesn't exist
  if (!bucket) {
    bucket = {
      tokens: capacity,
      lastRefillAt: now,
    }
    buckets.set(identifier, bucket)
  }

  // Refill tokens based on elapsed time
  const timePassed = now - bucket.lastRefillAt
  const refillCycles = Math.floor(timePassed / refillInterval)

  if (refillCycles > 0) {
    bucket.tokens = Math.min(capacity, bucket.tokens + refillCycles * tokensPerRefill)
    bucket.lastRefillAt = now + (refillCycles * refillInterval - timePassed)
  }

  // Check if request is allowed
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      retryAfter: 0,
    }
  }

  // Calculate when bucket will have tokens available
  const tokensNeeded = 1 - bucket.tokens
  const timeNeeded = (tokensNeeded / tokensPerRefill) * refillInterval
  const retryAfter = Math.ceil(timeNeeded / 1000) // Convert to seconds

  return {
    allowed: false,
    remaining: 0,
    retryAfter,
  }
}

/**
 * Reset rate limit for an identifier (e.g., after successful login)
 */
export function resetRateLimit(identifier: string): void {
  buckets.delete(identifier)
}

/**
 * Get rate limit status for debugging
 */
export function getRateLimitStatus(identifier: string): TokenBucket | null {
  return buckets.get(identifier) ?? null
}

/**
 * Clean up old buckets (call periodically)
 */
export function cleanupExpiredBuckets(maxAge: number = 3600000): void {
  // 1 hour default
  const now = Date.now()
  let cleaned = 0

  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefillAt > maxAge) {
      buckets.delete(key)
      cleaned++
    }
  }

  if (cleaned > 0) {
    console.log(`[Rate Limit] Cleaned up ${cleaned} expired buckets`)
  }
}

/**
 * Format rate limit error response
 */
export function rateLimitErrorResponse(retryAfter: number): Response {
  return Response.json(
    {
      error: 'Too many requests. Please try again later.',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(Date.now() + retryAfter * 1000).toISOString(),
      },
    }
  )
}

/**
 * Extract identifier from request (IP address or email)
 */
export function getRequestIdentifier(req: Request, fallback: string = 'unknown'): string {
  // Try to get IP from headers
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const clientIp = req.headers.get('x-client-ip')
  if (clientIp) {
    return clientIp
  }

  return fallback
}

/**
 * Pre-defined rate limit configs for different endpoints
 */
export const RATE_LIMIT_PRESETS = {
  // Auth endpoints: 10 attempts per minute
  auth: {
    capacity: 10,
    refillInterval: 60000,
    tokensPerRefill: 10,
  },

  // Password reset: 3 attempts per hour
  passwordReset: {
    capacity: 3,
    refillInterval: 3600000,
    tokensPerRefill: 3,
  },

  // Email verification: 5 attempts per hour
  emailVerification: {
    capacity: 5,
    refillInterval: 3600000,
    tokensPerRefill: 5,
  },

  // API endpoints: 100 requests per minute
  api: {
    capacity: 100,
    refillInterval: 60000,
    tokensPerRefill: 100,
  },

  // Strict: 1 attempt per 30 seconds
  strict: {
    capacity: 1,
    refillInterval: 30000,
    tokensPerRefill: 1,
  },
}
