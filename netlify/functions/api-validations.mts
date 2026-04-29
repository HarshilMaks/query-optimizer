import { json } from '@tanstack/start'
import { getRequestContext } from './lib/request-context'
import { listBlobs, getBlob } from '@netlify/blobs'

export default async (request: Request) => {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, { status: 405 })
  }

  const { tenantId } = getRequestContext(request)
  const url = new URL(request.url)
  const suggestionId = url.searchParams.get('suggestionId')
  const limit = parseInt(url.searchParams.get('limit') || '50')

  try {
    // List all validations for this tenant
    const blobs = await listBlobs({ prefix: `validation:${tenantId}:` })

    let validations = await Promise.all(
      blobs
        .filter(b => !b.key.includes('-index')) // Skip index entries
        .map(async b => {
          const blob = await getBlob({ key: b.key })
          return blob ? JSON.parse(blob) : null
        })
    )

    validations = validations.filter(Boolean)

    // Filter by suggestionId if provided
    if (suggestionId) {
      validations = validations.filter(v => v.suggestionId === suggestionId)
    }

    // Sort by createdAt descending
    validations.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    // Apply limit
    validations = validations.slice(0, limit)

    return json({ validations, count: validations.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: message }, { status: 500 })
  }
}
