import { Router } from 'express'
import fs from 'node:fs'
import { isPathInVault } from '../services/vault'

const router = Router()

router.post('/', (req, res) => {
  const { sourcePath, targetName } = req.body

  if (!sourcePath || !targetName) {
    res.status(400).json({ error: 'sourcePath 和 targetName 必填' })
    return
  }

  if (!fs.existsSync(sourcePath)) {
    res.status(404).json({ error: '文件不存在' })
    return
  }

  if (!isPathInVault(sourcePath)) {
    res.status(403).json({ error: '只能写入已配置 vault 内的文件' })
    return
  }

  const content = fs.readFileSync(sourcePath, 'utf-8')
  const link = `[[${targetName.replace(/\.md$/, '')}]]`

  if (content.includes(link)) {
    res.json({ ok: true, existed: true })
    return
  }

  if (content.includes('## 相关笔记')) {
    const updated = content.replace('## 相关笔记', `## 相关笔记\n- ${link}`)
    fs.writeFileSync(sourcePath, updated, 'utf-8')
  } else {
    fs.appendFileSync(sourcePath, `\n\n## 相关笔记\n- ${link}\n`)
  }

  res.json({ ok: true })
})

export default router
