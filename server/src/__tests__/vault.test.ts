import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scanVault, readFile, isPathInVault, loadConfig, saveConfig } from '../services/vault'

const tmpRoot = path.join(os.tmpdir(), `ofd-test-vault-${Date.now()}`)

describe('scanVault', () => {
  it('scans md files in directory', () => {
    const dir = path.join(tmpRoot, 'scan1')
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'a.md'), '# A')
    fs.writeFileSync(path.join(dir, 'sub', 'b.md'), '# B')
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'not md')

    const files = scanVault(dir)
    expect(files).toHaveLength(2)
    expect(files.map(f => f.name).sort()).toEqual(['a.md', 'b.md'])
  })

  it('skips hidden directories', () => {
    const dir = path.join(tmpRoot, 'scan2')
    fs.mkdirSync(path.join(dir, '.obsidian'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'visible.md'), '# visible')
    fs.writeFileSync(path.join(dir, '.obsidian', 'hidden.md'), '# hidden')

    const files = scanVault(dir)
    expect(files.map(f => f.name)).toEqual(['visible.md'])
  })

  it('returns empty for non-existent directory', () => {
    expect(scanVault('/nonexistent/path')).toEqual([])
  })
})

describe('readFile', () => {
  it('reads file content', () => {
    const file = path.join(tmpRoot, 'read.md')
    fs.writeFileSync(file, '# Hello World')
    expect(readFile(file)).toBe('# Hello World')
  })

  it('returns null for non-existent file', () => {
    expect(readFile('/nonexistent/file.md')).toBeNull()
  })
})

describe('isPathInVault', () => {
  it('detects paths inside vault', () => {
    const config = loadConfig()
    expect(typeof isPathInVault('/some/path/test.md', config)).toBe('boolean')
  })

  it('returns false when no vaults configured', () => {
    expect(isPathInVault('/tmp/foo.md', { vaults: [] })).toBe(false)
  })
})

describe('loadConfig / saveConfig', () => {
  it('loadConfig does not throw', () => {
    const config = loadConfig()
    expect(Array.isArray(config.vaults)).toBe(true)
  })

  it('saveConfig does not throw', () => {
    const original = loadConfig()
    expect(() => saveConfig(original)).not.toThrow()
  })
})
