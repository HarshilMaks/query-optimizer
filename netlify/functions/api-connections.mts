import type { Context } from '@netlify/functions'
import { getItem, setItem, listByPrefix, connKey } from './lib/storage.js'
import { encrypt } from './lib/crypto.js'
import { requireAuth, requireRole } from './lib/rbac.js'

export interface Connection {
  id: string; name: string; host: string; port: number; database_name: string
  username: string; password_encrypted: string; ssl_mode: 'prefer' | 'require' | 'disable'
  status: 'connected' | 'disconnected' | 'error'; last_tested_at: string | null; created_at: string
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async (req: Request, _ctx: Context) => {
  if (req.method === 'GET') {
    // Require authentication to list connections
    try {
      requireAuth(req)
    } catch (error) {
      return json({ error: 'Unauthorized' }, 401)
    }
    
    const connections = await listByPrefix('conn/')
    const safe = connections.map((c: Connection) => ({ ...c, password_encrypted: '[hidden]' }))
    return json(safe)
  }

  if (req.method === 'POST') {
    // Require admin to create connections
    try {
      const claims = requireAuth(req)
      requireRole(claims, 'admin')
    } catch (error) {
      return json({ error: 'Unauthorized: Admin role required' }, 401)
    }

    const body = await req.json()
    const { name, host, port, database_name, username, password, ssl_mode } = body
    if (!name || !host || !database_name || !username || !password) {
      return json({ error: 'Missing required fields' }, 400)
    }
    const id = crypto.randomUUID()
    const conn: Connection = {
      id, name, host, port: port ?? 5432, database_name, username,
      password_encrypted: encrypt(password),
      ssl_mode: ssl_mode ?? 'prefer',
      status: 'disconnected', last_tested_at: null,
      created_at: new Date().toISOString(),
    }
    await setItem(connKey(id), conn)
    return json({ ...conn, password_encrypted: '[hidden]' }, 201)
  }

  return json({ error: 'Method not allowed' }, 405)
}

export const config = { path: '/api/connections' }
