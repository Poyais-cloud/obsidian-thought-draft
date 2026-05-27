import { Router } from 'express'
import {
  listSessions, getSession, saveSession, deleteSession,
  isValidSessionId, isValidSessionMode,
} from '../services/sessions'

const router = Router()

router.get('/', (req, res) => {
  const { id, mode } = req.query
  if (mode && !isValidSessionMode(String(mode))) {
    res.status(400).json({ error: 'invalid mode' })
    return
  }
  if (id) {
    if (!isValidSessionId(String(id))) {
      res.status(400).json({ error: 'invalid id' })
      return
    }
    const s = getSession(String(id), mode ? String(mode) : undefined)
    if (s) {
      res.json(s)
    } else {
      res.status(404).json({ error: 'not found' })
    }
    return
  }
  res.json(listSessions())
})

router.post('/', (req, res) => {
  const body = req.body
  if (!body.messages) {
    res.status(400).json({ error: 'messages required' })
    return
  }
  if (body.id && !isValidSessionId(body.id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }
  if (body.mode && !isValidSessionMode(body.mode)) {
    res.status(400).json({ error: 'invalid mode' })
    return
  }
  const session = saveSession(body)
  res.json(session)
})

router.delete('/', (req, res) => {
  const { id } = req.query
  if (!id) {
    res.status(400).json({ error: 'id required' })
    return
  }
  if (!isValidSessionId(String(id))) {
    res.status(400).json({ error: 'invalid id' })
    return
  }
  const ok = deleteSession(String(id))
  res.json({ ok })
})

export default router
