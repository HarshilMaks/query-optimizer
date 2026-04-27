import type { Context } from '@netlify/functions'
import { getItem, setItem, suggestionKey } from './lib/storage.js'
import { appendAuditEvent } from './lib/audit.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default async (req: Request, ctx: Context) => {
  if (req.method !== 'PUT') return json({ error: 'Method not allowed' }, 405)

  const { id } = ctx.params
  const suggestion = await getItem<any>(suggestionKey(id))
  if (!suggestion) return json({ error: 'Not found' }, 404)

  const body = await req.json()
  const updated = {
    ...suggestion,
    ...body,
    updated_at: new Date().toISOString(),
  }
  await setItem(suggestionKey(id), updated)
  await appendAuditEvent({
    entity_type: 'suggestion',
    entity_id: id,
    action: 'suggestion.updated',
    reason: 'Suggestion updated by API',
    metadata: { changed_fields: Object.keys(body ?? {}) },
  })

  return json(updated)
}

export const config = { path: '/api/suggestions/:id' }

