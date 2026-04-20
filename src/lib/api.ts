// API client for QuerySage backend

const BASE = ''

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

// Connections
export const api = {
  connections: {
    list: () => request<any[]>('/api/connections'),
    get: (id: string) => request<any>(`/api/connections/${id}`),
    create: (data: any) => request<any>('/api/connections', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/api/connections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/api/connections/${id}`, { method: 'DELETE' }),
    test: (id: string) => request<any>(`/api/connections/${id}/test`, { method: 'POST' }),
  },
  queries: {
    list: (connectionId?: string) => request<any[]>(`/api/queries${connectionId ? `?connection_id=${connectionId}` : ''}`),
    get: (id: string) => request<any>(`/api/queries/${id}`),
    refresh: (connectionId: string) => request<any>('/api/queries', { method: 'POST', body: JSON.stringify({ connection_id: connectionId }) }),
    explain: (id: string) => request<any>(`/api/queries/${id}/explain`, { method: 'POST', body: JSON.stringify({}) }),
    analyze: (id: string) => request<any>(`/api/queries/${id}/analyze`, { method: 'POST', body: JSON.stringify({}) }),
  },
  suggestions: {
    list: (params?: { status?: string; connection_id?: string; type?: string }) => {
      const q = new URLSearchParams(params as any).toString()
      return request<any[]>(`/api/suggestions${q ? `?${q}` : ''}`)
    },
    update: (id: string, data: any) => request<any>(`/api/suggestions?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    apply: (id: string) => request<any>(`/api/suggestions/${id}/apply`, { method: 'POST', body: JSON.stringify({}) }),
    exportUrl: () => '/api/suggestions/export',
  },
  digest: {
    get: () => request<any>('/api/digest'),
    updateSettings: (data: any) => request<any>('/api/digest/settings', { method: 'PUT', body: JSON.stringify(data) }),
    send: (email: string) => request<any>('/api/digest/send', { method: 'POST', body: JSON.stringify({ recipient_email: email }) }),
  },
}
