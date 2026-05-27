import fs from 'node:fs'
import path from 'node:path'

function dataDir() { return path.join(process.cwd(), 'data') }
function configFile() { return path.join(dataDir(), 'vault.json') }

export interface VaultInfo {
  name: string
  path: string
  type?: 'study' | 'life' | 'blog'
}

export interface FileInfo {
  name: string
  path: string
  size: number
  updatedAt: number
}

export interface VaultConfig {
  vaults: VaultInfo[]
}

export function loadConfig(): VaultConfig {
  try {
    const cf = configFile()
    if (fs.existsSync(cf)) {
      return JSON.parse(fs.readFileSync(cf, 'utf-8'))
    }
  } catch {}
  return { vaults: [] }
}

function normalizeDir(dir: string): string {
  return path.resolve(dir)
}

export function isPathInVault(filePath: string, config = loadConfig()): boolean {
  const resolvedFile = path.resolve(filePath)
  return config.vaults.some(vault => {
    if (!vault.path) return false
    const resolvedVault = normalizeDir(vault.path)
    return resolvedFile === resolvedVault || resolvedFile.startsWith(`${resolvedVault}${path.sep}`)
  })
}

export function saveConfig(config: VaultConfig) {
  const dd = dataDir()
  if (!fs.existsSync(dd)) fs.mkdirSync(dd, { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify(config, null, 2), 'utf-8')
}

export function scanVault(vaultPath: string): FileInfo[] {
  const files: FileInfo[] = []
  const walk = (dir: string) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full) } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const stat = fs.statSync(full)
        files.push({ name: entry.name, path: full, size: stat.size, updatedAt: stat.mtimeMs })
      }
    }
  }
  walk(vaultPath)
  return files.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function readFile(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf-8') } catch { return null }
}
