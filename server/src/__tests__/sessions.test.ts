import { describe, it, expect } from 'vitest'
import {
  createSessionId,
  isValidSessionId,
  isValidSessionMode,
  listSessions,
  getSession,
  saveSession,
  deleteSession,
} from '../services/sessions'

describe('createSessionId', () => {
  it('returns 12-char hex string', () => {
    const id = createSessionId()
    expect(id).toMatch(/^[a-f0-9]{12}$/)
  })

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createSessionId()))
    expect(ids.size).toBe(20)
  })
})

describe('isValidSessionId', () => {
  it('accepts valid ids', () => {
    expect(isValidSessionId('abc123')).toBe(true)
    expect(isValidSessionId('test_session')).toBe(true)
    expect(isValidSessionId('a')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidSessionId('')).toBe(false)
  })

  it('rejects path traversal', () => {
    expect(isValidSessionId('../../../etc/passwd')).toBe(false)
  })

  it('rejects ids longer than 64 chars', () => {
    expect(isValidSessionId('a'.repeat(65))).toBe(false)
  })
})

describe('isValidSessionMode', () => {
  it('accepts brainstorm, writing, connect', () => {
    expect(isValidSessionMode('brainstorm')).toBe(true)
    expect(isValidSessionMode('writing')).toBe(true)
    expect(isValidSessionMode('connect')).toBe(true)
  })

  it('rejects unknown modes', () => {
    expect(isValidSessionMode('chat')).toBe(false)
    expect(isValidSessionMode('')).toBe(false)
  })
})

describe('session CRUD', () => {
  const testId = `test-${Date.now().toString(36)}`

  it('saves and retrieves a session', () => {
    const session = saveSession({
      id: testId,
      mode: 'brainstorm',
      title: 'Test Session',
      messages: [{ id: '1', role: 'user', content: 'hello' }],
    })

    expect(session.id).toBe(testId)
    expect(session.title).toBe('Test Session')

    const retrieved = getSession(testId)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.messages).toHaveLength(1)
    expect(retrieved!.messages[0].role).toBe('user')
  })

  it('overwrites existing session on save', () => {
    saveSession({
      id: testId,
      mode: 'brainstorm',
      title: 'Updated',
      messages: [{ id: '2', role: 'assistant', content: 'hi back' }],
    })

    const retrieved = getSession(testId)
    expect(retrieved!.title).toBe('Updated')
    expect(retrieved!.messages).toHaveLength(1)
  })

  it('lists sessions', () => {
    const list = listSessions()
    expect(list.length).toBeGreaterThan(0)
    expect(list.some(s => s.id === testId)).toBe(true)
  })

  it('deletes session', () => {
    expect(getSession(testId)).not.toBeNull()
    deleteSession(testId)
    expect(getSession(testId)).toBeNull()
  })

  it('returns null for non-existent session', () => {
    expect(getSession('nonexistent-id')).toBeNull()
  })

  it('rejects invalid session id on get', () => {
    expect(getSession('../../../etc')).toBeNull()
  })

  it('generates id when not provided', () => {
    const session = saveSession({
      mode: 'brainstorm',
      messages: [{ id: '1', role: 'user', content: 'auto id' }],
    })
    expect(session.id).toMatch(/^[a-f0-9]{12}$/)
    deleteSession(session.id)
  })
})
