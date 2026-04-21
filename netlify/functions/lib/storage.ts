import { getStore } from '@netlify/blobs'

const store = getStore({ name: 'querysage', consistency: 'strong' })

export async function listByPrefix(prefix: string): Promise<any[]> {
  const { blobs } = await store.list({ prefix })
  if (blobs.length === 0) return []
  const items = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })))
  return items.filter(Boolean) as any[]
}

export async function getItem<T>(key: string): Promise<T | null> {
  return store.get(key, { type: 'json' }) as Promise<T | null>
}

export async function setItem(key: string, value: object): Promise<void> {
  await store.setJSON(key, value)
}

export async function deleteItem(key: string): Promise<void> {
  await store.delete(key)
}

export function connKey(id: string) { return `conn/${id}` }
export function queryKey(id: string) { return `query/${id}` }
export function explainKey(id: string) { return `explain/${id}` }
export function analysisKey(id: string) { return `analysis/${id}` }
export function suggestionKey(id: string) { return `suggestion/${id}` }
