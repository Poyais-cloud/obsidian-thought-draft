import type { Request, Response, NextFunction } from 'express'

export function corsMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  next()
}

export function handlePreflight(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
}
