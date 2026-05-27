import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { corsMiddleware, handlePreflight } from './middleware/cors'
import { errorHandler, notFound } from './middleware/error'
import vaultRouter from './routes/vault'
import vaultScanRouter from './routes/vault-scan'
import knowledgeRouter from './routes/knowledge'
import searchRouter from './routes/search'
import chatRouter from './routes/chat'
import sessionsRouter from './routes/sessions'
import exportRouter from './routes/export'
import linkRouter from './routes/link'

// Ensure cwd is project root so data/ resolves correctly
const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.chdir(path.resolve(__dirname, '..', '..'))

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json({ limit: '1mb' }))
app.use(corsMiddleware)
app.use(handlePreflight)

// API routes — matched to the same paths the Vue frontend calls via /api/*
app.use('/api/vault', vaultRouter)       // GET/POST /api/vault
app.use('/api/vault', vaultScanRouter)   // POST /api/vault/scan
app.use('/api/knowledge', knowledgeRouter) // /api/knowledge/index
app.use('/api/search', searchRouter)     // /api/search
app.use('/api/chat', chatRouter)         // /api/chat
app.use('/api/sessions', sessionsRouter) // /api/sessions
app.use('/api/export', exportRouter)     // /api/export/blog, /api/export/wechat
app.use('/api/link', linkRouter)         // /api/link

app.use(notFound)
app.use(errorHandler)

if (process.env.NODE_ENV !== 'test') {
  if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === 'sk-your-deepseek-api-key-here') {
    console.warn('[警告] DEEPSEEK_API_KEY 未配置或仍为示例值，对话功能将不可用。')
    console.warn('  请将 server/.env.example 重命名为 server/.env 并填入你的 DeepSeek API Key。')
    console.warn('  获取地址: https://platform.deepseek.com/api_keys')
  }

  app.listen(PORT, () => {
    console.log(`[服务] Express 后端已启动: http://localhost:${PORT}`)
    console.log(`[服务] API 端点:`)
    console.log(`  GET/POST  /api/vault`)
    console.log(`  POST      /api/vault/scan`)
    console.log(`  POST      /api/knowledge/index`)
    console.log(`  POST      /api/search`)
    console.log(`  POST      /api/chat (SSE)`)
    console.log(`  GET/POST/DELETE /api/sessions`)
    console.log(`  POST      /api/export/blog`)
    console.log(`  POST      /api/export/wechat`)
    console.log(`  POST      /api/link`)
  })
}

export default app
