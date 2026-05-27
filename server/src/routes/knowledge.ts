import { Router } from 'express'
import { loadConfig } from '../services/vault'
import { indexVault, loadIndex } from '../services/knowledge'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

const router = Router()

function sse(res: ReturnType<Router['prototype'] extends (...args: infer _) => infer R ? R : never>, data: object) {
  // @ts-expect-error: res in express can call write()
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

router.get('/', (_req, res) => {
  const indexFile = path.join(process.cwd(), 'data', 'knowledge.json')
  const indexed = existsSync(indexFile)
  let docCount = 0
  let sizeBytes = 0
  if (indexed) {
    try {
      sizeBytes = statSync(indexFile).size
      loadIndex()
      // docCount is tracked via global state after loadIndex
      const g = globalThis as { __ofd_ms?: { documentCount: number } }
      docCount = g.__ofd_ms?.documentCount ?? 0
    } catch {}
  }
  res.json({ indexed, docCount, sizeBytes })
})

router.post('/index', async (req, res) => {
  const { index } = req.body
  const config = loadConfig()

  if (typeof index !== 'number' || index < 0 || index >= config.vaults.length) {
    res.status(400).json({ error: 'vault 索引无效' })
    return
  }

  const vault = config.vaults[index]
  const useSSE = req.headers.accept?.includes('text/event-stream')

  if (useSSE) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const t0 = Date.now()
    try {
      const result = await indexVault(vault.name, vault.path, (phase, detail) => {
        sse(res as any, { type: 'progress', phase, detail })
      })
      const elapsed = Date.now() - t0
      sse(res as any, { type: 'done', vault: vault.name, fragments: result.fragments, elapsed, indexed: result.indexed, skipped: result.skipped })
    } catch (err) {
      sse(res as any, { type: 'error', error: (err as Error).message })
    } finally {
      res.end()
    }
    return
  }

  // Legacy non-SSE mode
  try {
    const result = await indexVault(vault.name, vault.path)
    res.json({ vault: vault.name, fragments: result.fragments, elapsed: 0 })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
