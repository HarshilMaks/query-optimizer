import type { Context } from '@netlify/functions'
import { getItem, setItem, deleteItem, connKey } from './lib/storage.js'
import { encrypt } from './lib/crypto.js'
import type { Connection } from './api-connections.mjs'

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } })
}

export default async (req: Request, ctx: Context) => {
  const { id } = ctx.params
  const conn = await getItem<Connection>(connKey(id))

  if (req.method === 'GET') {
    if (!conn) return json({ error: 'Not found' }, 404)
    return json({ ...conn, password_encrypted: '[hidden]' })
  }

  if (req.method === 'PUT') {
    if (!conn) return json({ error: 'Not found' }, 404)
    const body = await req.json()
    const updated: Connection = {
      ...conn,
      name: body.name ?? conn.name,
      host: body.host ?? conn.host,
      port: body.port ?? conn.port,
      database_name: body.database_name ?? conn.database_name,
      username: body.username ?? conn.username,
      ssl_mode: body.ssl_mode ?? conn.ssl_mode,
      password_encrypted: body.password ? encrypt(body.password) : conn.password_encrypted,
    }
    await setItem(connKey(id), updated)
    return json({ ...updated, password_encrypted: '[hidden]' })
  }

  if (req.method === 'DELETE') {
    if (!conn) return json({ error: 'Not found' }, 404)
    await deleteItem(connKey(id))
    return json({ deleted: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}

export const config = { path: '/api/connections/:id' }
