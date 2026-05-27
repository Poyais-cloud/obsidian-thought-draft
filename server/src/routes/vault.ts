import { Router } from 'express'
import { loadConfig, saveConfig } from '../services/vault'
import type { VaultInfo } from '../types'

const VAULT_TYPES = new Set(['study', 'life', 'blog'])

function isVaultInfo(value: unknown): value is VaultInfo {
  if (!value || typeof value !== 'object') return false
  const vault = value as Record<string, unknown>
  return (
    typeof vault.name === 'string' &&
    typeof vault.path === 'string' &&
    (vault.type === undefined || (typeof vault.type === 'string' && VAULT_TYPES.has(vault.type)))
  )
}

const router = Router()

router.get('/', (_req, res) => {
  res.json(loadConfig())
})

router.post('/', (req, res) => {
  const { vaults } = req.body
  if (!Array.isArray(vaults)) {
    res.status(400).json({ error: 'vaults 必须是数组' })
    return
  }
  if (!vaults.every(isVaultInfo)) {
    res.status(400).json({ error: 'vault 格式无效' })
    return
  }
  saveConfig({ vaults })
  res.json({ ok: true })
})

export default router
