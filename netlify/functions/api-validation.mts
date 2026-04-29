import { json } from '@tanstack/start'
import { getRequestContext } from './lib/request-context'
import { listBlobs, getBlob } from '@netlify/blobs'
import { runValidation } from './lib/validation'
import { getSuggestion } from './lib/storage'

export default async (request: Request) => {
  if (request.method === 'POST') {
    const { tenantId, actorId } = getRequestContext(request)
    const { suggestionId, connectionId } = await request.json()

    if (!suggestionId || !connectionId) {
      return json({ error: 'suggestionId and connectionId required' }, { status: 400 })
    }

    try {
      // Get the suggestion to extract query and optimized SQL
      const suggestionKey = `suggestion:${tenantId}:${suggestionId}`
      const blob = await getBlob({ key: suggestionKey })

      if (!blob) {
        return json({ error: 'Suggestion not found' }, { status: 404 })
      }

      const suggestion = JSON.parse(blob)

      // Run validation
      const validation = await runValidation(
        suggestionId,
        connectionId,
        suggestion.query,
        suggestion.sql_to_run,
        tenantId,
        actorId
      )

      // Store validation result
      const validationKey = `validation:${tenantId}:${validation.id}`
      await fetch(new URL(`/api/netlify/blobs/validation:${tenantId}:${validation.id}`, request.url), {
        method: 'PUT',
        body: JSON.stringify(validation),
        headers: { 'Content-Type': 'application/json' },
      })

      return json(validation)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return json({ error: message }, { status: 500 })
    }
  }

  if (request.method === 'GET') {
    // GET /api/validation/:id
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const validationId = pathParts[pathParts.length - 1]

    if (!validationId || validationId === 'validation') {
      return json({ error: 'validationId required' }, { status: 400 })
    }

    const { tenantId } = getRequestContext(request)

    try {
      const validationKey = `validation:${tenantId}:${validationId}`
      const blob = await getBlob({ key: validationKey })

      if (!blob) {
        return json({ error: 'Validation not found' }, { status: 404 })
      }

      const validation = JSON.parse(blob)
      return json(validation)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return json({ error: message }, { status: 500 })
    }
  }

  return json({ error: 'Method not allowed' }, { status: 405 })
}
