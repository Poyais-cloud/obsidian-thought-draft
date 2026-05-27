import { describe, it, expect } from 'vitest'

describe('knowledge module', () => {
  it('can be imported and has expected exports', async () => {
    const mod = await import('../services/knowledge')
    expect(typeof mod.search).toBe('function')
    expect(typeof mod.searchAll).toBe('function')
    expect(typeof mod.loadIndex).toBe('function')
    expect(typeof mod.indexVault).toBe('function')
  })

  it('loadIndex does not throw with no data', async () => {
    const { loadIndex } = await import('../services/knowledge')
    expect(() => loadIndex()).not.toThrow()
  })
})
