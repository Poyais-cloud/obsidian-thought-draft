import type {
  VaultConfig, SearchResponse, Session, SessionItem,
  ClientMessage, ClientSource, Mode
} from '@/types'

const BASE = '/api'

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function del<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const api = {
  // Vault
  getVaults: () => get<VaultConfig>('/vault'),
  saveVaults: (vaults: VaultConfig) => post<{ ok: boolean }>('/vault', vaults),
  scanVault: (index: number) => post<{ vault: string; count: number; files: { name: string; path: string; size: number; updatedAt: number }[] }>('/vault/scan', { index }),
  indexVault: (index: number) => post<{ vault: string; fragments: number; elapsed: number }>('/knowledge/index', { index }),

  // Search
  search: (query: string, vault?: string, topK = 30) =>
    post<SearchResponse>('/search', { query, topK, vault: vault || undefined }),

  // Chat (SSE streaming)
  chatStream: (body: { messages: ClientMessage[]; mode: Mode; vault?: string; switched?: boolean; sources?: ClientSource[] }) =>
    fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  // Sessions
  getSessions: () => get<SessionItem[]>('/sessions'),
  getSession: (id: string, mode?: string) => get<Session>(`/sessions?id=${id}${mode ? `&mode=${mode}` : ''}`),
  saveSession: (body: { id?: string; title?: string; mode?: string; messages: ClientMessage[] }) =>
    post<Session>('/sessions', body),
  deleteSession: (id: string) => del<{ ok: boolean }>(`/sessions?id=${id}`),

  // Export
  exportBlog: (body: {
    messages: ClientMessage[]
    mode: Mode
    blogType?: string
    title?: string
    tags?: string[]
    category?: string
    slug?: string
    vaultName: string
  }) => post<{ path: string; title: string }>('/export/blog', body),

  exportWechat: (body: { text: string }) =>
    post<{ html: string }>('/export/wechat', body),

  exportPreview: (body: {
    content: string
    title?: string
    type?: string
    slug?: string
    tags?: string[]
    categoryPath?: string[]
    mathjax?: boolean
    sources?: { sourceName: string; sourcePath: string }[]
    format?: 'blog' | 'wechat' | 'markdown'
  }) => post<{ content: string; format: string }>('/export/preview', body),

  // Index with SSE progress
  indexVaultStream: (
    index: number,
    onProgress: (phase: string, detail?: { current?: number; total?: number }) => void
  ): Promise<{ vault: string; fragments: number; elapsed: number; indexed: number; skipped: number }> =>
    new Promise((resolve, reject) => {
      fetch(`${BASE}/knowledge/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ index }),
      })
        .then(async res => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
            reject(new Error(err.error || `HTTP ${res.status}`))
            return
          }
          if (!res.body) { reject(new Error('响应为空')); return }
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                try {
                  const parsed = JSON.parse(data)
                  if (parsed.type === 'progress') {
                    onProgress(parsed.phase, parsed.detail)
                  } else if (parsed.type === 'done') {
                    resolve(parsed)
                  } else if (parsed.type === 'error') {
                    reject(new Error(parsed.error))
                  }
                } catch { /* skip */ }
              }
            }
          }
        })
        .catch(reject)
    }),

  // Link write-back
  writeLink: (body: { sourcePath: string; targetName: string }) =>
    post<{ ok: boolean }>('/link', body),
}
