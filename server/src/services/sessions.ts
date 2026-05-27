import fs from 'node:fs'
import path from 'node:path'

function dir() { return path.join(process.cwd(), 'data', 'sessions') }
const SESSION_ID_RE = /^[a-z0-9_-]{1,64}$/i
const SESSION_MODES = ['brainstorm', 'writing', 'connect'] as const

export type SessionMode = typeof SESSION_MODES[number]

export interface Session {
  id: string
  mode: SessionMode
  title: string
  createdAt: string
  updatedAt: string
  messages: SessionMessage[]
}

export interface SessionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: unknown[]
  sourceVisible?: number
  sourceDismissed?: number[]
}

export function createSessionId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id)
}

export function isValidSessionMode(mode: string): mode is SessionMode {
  return SESSION_MODES.includes(mode as SessionMode)
}

function normalizeMode(mode?: string): SessionMode {
  return mode && isValidSessionMode(mode) ? mode : 'brainstorm'
}

function sessionFile(id: string, mode: SessionMode): string {
  return path.join(dir(), `${id}.${mode}.json`)
}

function legacySessionFile(id: string): string {
  return path.join(dir(), `${id}.json`)
}

function ensureDir() {
  if (!fs.existsSync(dir())) fs.mkdirSync(dir(), { recursive: true })
}

export function listSessions(): { id: string; title: string; updatedAt: string }[] {
  ensureDir()
  try {
    const latest = new Map<string, { id: string; title: string; updatedAt: string }>()
    fs.readdirSync(dir())
      .filter(f => f.endsWith('.json'))
      .forEach(f => {
        try {
          const s: Session = JSON.parse(fs.readFileSync(path.join(dir(), f), 'utf-8'))
          const current = latest.get(s.id)
          if (!current || s.updatedAt.localeCompare(current.updatedAt) > 0) {
            latest.set(s.id, { id: s.id, title: s.title, updatedAt: s.updatedAt })
          }
        } catch {}
      })
    return [...latest.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch { return [] }
}

export function getSession(id: string, mode?: string): Session | null {
  if (!isValidSessionId(id)) return null
  ensureDir()
  const selectedMode = normalizeMode(mode)
  try {
    return JSON.parse(fs.readFileSync(sessionFile(id, selectedMode), 'utf-8'))
  } catch {
    if (selectedMode !== 'brainstorm') return null
    try {
      const legacy: Omit<Session, 'mode'> = JSON.parse(fs.readFileSync(legacySessionFile(id), 'utf-8'))
      return { ...legacy, mode: 'brainstorm' }
    } catch { return null }
  }
}

export function saveSession(data: { id?: string; mode?: string; title?: string; messages: SessionMessage[] }): Session {
  ensureDir()
  const id = data.id && isValidSessionId(data.id) ? data.id : createSessionId()
  const mode = normalizeMode(data.mode)
  const now = new Date().toISOString()
  const existing = getSession(id, mode)

  const session: Session = {
    id,
    mode,
    title: data.title || existing?.title || '新会话',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    messages: data.messages,
  }

  fs.writeFileSync(sessionFile(id, mode), JSON.stringify(session, null, 2), 'utf-8')
  return session
}

export function deleteSession(id: string): boolean {
  if (!isValidSessionId(id)) return false
  let deleted = false
  for (const filePath of [legacySessionFile(id), ...SESSION_MODES.map(mode => sessionFile(id, mode))]) {
    try {
      fs.unlinkSync(filePath)
      deleted = true
    } catch {}
  }
  return deleted
}
