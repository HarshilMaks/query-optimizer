import { createHash, randomUUID } from 'crypto'
import { auditKey, listByPrefix, setItem } from './storage.js'

export interface AuditEvent {
  id: string
  tenant_id: string
  entity_type: string
  entity_id: string
  action: string
  actor_id: string
  reason: string
  metadata: Record<string, unknown>
  timestamp: string
  prev_event_hash: string | null
  event_hash: string
}

function hashEvent(input: string) {
  return createHash('sha256').update(input).digest('hex')
}

export async function appendAuditEvent(payload: {
  tenant_id?: string
  entity_type: string
  entity_id: string
  action: string
  actor_id?: string
  reason?: string
  metadata?: Record<string, unknown>
}) {
  const tenantId = payload.tenant_id ?? 'default'
  const events = (await listByPrefix('audit/')) as AuditEvent[]
  const latest = events
    .filter((e) => e.tenant_id === tenantId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]

  const timestamp = new Date().toISOString()
  const id = randomUUID()
  const prev = latest?.event_hash ?? null
  const body = JSON.stringify({
    id,
    tenant_id: tenantId,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    action: payload.action,
    actor_id: payload.actor_id ?? 'system',
    reason: payload.reason ?? '',
    metadata: payload.metadata ?? {},
    timestamp,
    prev_event_hash: prev,
  })
  const eventHash = hashEvent(body)
  const event: AuditEvent = {
    id,
    tenant_id: tenantId,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    action: payload.action,
    actor_id: payload.actor_id ?? 'system',
    reason: payload.reason ?? '',
    metadata: payload.metadata ?? {},
    timestamp,
    prev_event_hash: prev,
    event_hash: eventHash,
  }

  await setItem(auditKey(id), event)
  return event
}
