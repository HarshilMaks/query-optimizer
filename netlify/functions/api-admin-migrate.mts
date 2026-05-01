/**
 * Database Migration Endpoint
 * Initializes schema when deployed
 */

import type { Context } from '@netlify/functions'
import { runMigrations } from './lib/db.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const result = await runMigrations()
    return json(result, result.success ? 200 : 500)
  } catch (error) {
    console.error('Migration endpoint error:', error)
    return json(
      { error: 'Migration failed', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    )
  }
}

export const config = { path: '/api/admin/migrate' }
