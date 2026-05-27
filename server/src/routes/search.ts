import { Router } from 'express'
import { search } from '../services/knowledge'

const router = Router()

router.post('/', (req, res) => {
  const { query, topK, vault } = req.body
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'query 不能为空' })
    return
  }
  const results = search(query.trim(), topK || 5, vault || undefined)
  res.json({ query, results, count: results.length })
})

export default router
