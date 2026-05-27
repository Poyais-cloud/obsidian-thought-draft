import { Router } from 'express'
import { loadConfig, scanVault } from '../services/vault'

const router = Router()

router.post('/scan', (req, res) => {
  const { index } = req.body
  const config = loadConfig()

  if (typeof index !== 'number' || index < 0 || index >= config.vaults.length) {
    res.status(400).json({ error: 'vault 索引无效' })
    return
  }

  const vault = config.vaults[index]
  const files = scanVault(vault.path)

  res.json({
    vault: vault.name,
    count: files.length,
    files,
  })
})

export default router
