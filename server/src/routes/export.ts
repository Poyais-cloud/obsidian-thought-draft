import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { BLOG_TYPES, getBlogTypeConfig } from '../services/blog-config'
import { loadConfig } from '../services/vault'
import { markdownToWechatHTML } from '../services/wechat'

interface ExportSource {
  sourceName: string
  sourcePath: string
}

interface ExportRequest {
  content?: string
  title?: string
  type?: string
  slug?: string
  tags?: string[]
  categoryPath?: string[]
  date?: string
  mathjax?: boolean
  sources?: ExportSource[]
}

function isExportSource(value: unknown): value is ExportSource {
  if (!value || typeof value !== 'object') return false
  const source = value as Record<string, unknown>
  return typeof source.sourceName === 'string' && typeof source.sourcePath === 'string'
}

function slugify(input: string): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|#]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80)
}

function nowString(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    now.getFullYear(), '-',
    pad(now.getMonth() + 1), '-',
    pad(now.getDate()), ' ',
    pad(now.getHours()), ':',
    pad(now.getMinutes()), ':',
    pad(now.getSeconds()),
  ].join('')
}

function permalinkFor(date: string, slug: string): string {
  const [day] = date.split(' ')
  return `${day.replaceAll('-', '/')}/${slug}/`
}

function yamlList(values: string[] | string[][], indent = 2): string {
  return values
    .map(value => {
      if (Array.isArray(value)) return `${' '.repeat(indent)}- [${value.join(', ')}]`
      return `${' '.repeat(indent)}- ${value}`
    })
    .join('\n')
}

function frontMatter(input: {
  title: string
  date: string
  slug: string
  tags: string[]
  categoryPath: string[]
  mathjax?: boolean
  cover: string
  topImg: string
}): string {
  const categories: string[] | string[][] = input.categoryPath.length > 1
    ? [input.categoryPath]
    : input.categoryPath

  const lines = [
    '---',
    `title: ${input.title}`,
    `date: ${input.date}`,
    `permalink: ${permalinkFor(input.date, input.slug)}`,
    'tags:',
    yamlList(input.tags),
    'categories:',
    yamlList(categories),
  ]

  if (input.mathjax) lines.push('mathjax: true')
  lines.push(`cover: ${input.cover}`)
  lines.push(`top_img: ${input.topImg}`)
  lines.push('---')

  return lines.join('\n')
}

function obsidianUri(sourcePath: string): string {
  const parts = sourcePath.split(path.sep)
  const userIdx = parts.indexOf('Users')
  if (userIdx < 0) return `file://${sourcePath}`
  const vaultName = parts[userIdx + 2]
  const relPath = parts.slice(userIdx + 3).join('/')
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relPath)}`
}

function markdownLinkForSource(source: ExportSource): string {
  const title = source.sourceName.replace(/\.md$/i, '')
  return `[${title}](${obsidianUri(source.sourcePath)})`
}

function appendSourceLinks(content: string, sources: ExportSource[]): string {
  const unique = new Map<string, ExportSource>()
  for (const source of sources) {
    unique.set(source.sourcePath, source)
  }
  const links = [...unique.values()].slice(0, 20).map(source => `- ${markdownLinkForSource(source)}`)
  if (!links.length) return content

  return [
    content.trimEnd(),
    '',
    '## 参考与延伸',
    '',
    ...links,
    '',
  ].join('\n')
}

const router = Router()

// GET /api/export/blog — list blog types
router.get('/blog', (_req, res) => {
  res.json({ types: BLOG_TYPES })
})

// POST /api/export/blog — export to Hexo draft
router.post('/blog', (req, res) => {
  const body = req.body as ExportRequest
  const { content, title } = body

  if (!content || !title) {
    res.status(400).json({ error: 'content 和 title 必填' })
    return
  }

  const typeConfig = getBlogTypeConfig(body.type || 'blog')
  if (!typeConfig) {
    res.status(400).json({ error: '未知博客类型' })
    return
  }

  const config = loadConfig()
  const blog = config.vaults.find(v => v.type === 'blog')
  if (!blog?.path) {
    res.status(400).json({ error: '未配置博客 vault，请先在侧边栏设置博客 vault 路径' })
    return
  }

  const tags = Array.isArray(body.tags) && body.tags.length
    ? body.tags.map(tag => tag.trim()).filter(Boolean)
    : typeConfig.tags
  const categoryPath = Array.isArray(body.categoryPath) && body.categoryPath.length
    ? body.categoryPath.map(category => category.trim()).filter(Boolean)
    : typeConfig.categoryPath
  const date = body.date?.trim() || nowString()
  const slug = slugify(body.slug || title)
  if (!slug) {
    res.status(400).json({ error: 'slug 无效' })
    return
  }

  const draftsDir = path.join(blog.path, 'source', '_drafts', typeConfig.folder)
  fs.mkdirSync(draftsDir, { recursive: true })

  const filename = `${slug}.md`
  const filepath = path.join(draftsDir, filename)
  if (fs.existsSync(filepath)) {
    res.status(409).json({ error: `草稿已存在: ${path.relative(blog.path, filepath)}` })
    return
  }

  const sources = Array.isArray(body.sources) ? body.sources.filter(isExportSource) : []
  const markdown = appendSourceLinks(content, sources)
  const fileContent = `${frontMatter({
    title,
    date,
    slug,
    tags,
    categoryPath,
    mathjax: body.mathjax ?? typeConfig.mathjax,
    cover: typeConfig.cover,
    topImg: typeConfig.topImg,
  })}\n\n${markdown}\n`

  fs.writeFileSync(filepath, fileContent, 'utf-8')

  res.json({
    ok: true,
    status: 'draft',
    filename,
    filepath,
    relativePath: path.relative(blog.path, filepath),
    message: `已导出草稿: ${path.relative(blog.path, filepath)}`,
  })
})

// POST /api/export/preview — generate preview without writing to disk
router.post('/preview', async (req, res) => {
  const body = req.body as {
    content?: string
    title?: string
    type?: string
    slug?: string
    tags?: string[]
    categoryPath?: string[]
    mathjax?: boolean
    sources?: ExportSource[]
    format?: 'blog' | 'wechat' | 'markdown'
  }

  const { content, format = 'blog' } = body
  if (!content) {
    res.status(400).json({ error: 'content 必填' })
    return
  }

  try {
    if (format === 'wechat') {
      const html = await markdownToWechatHTML(content)
      res.json({ content: html, format: 'html' })
      return
    }

    if (format === 'markdown') {
      const sources = Array.isArray(body.sources) ? body.sources.filter(isExportSource) : []
      const md = appendSourceLinks(content, sources)
      res.json({ content: md, format: 'markdown' })
      return
    }

    // Blog format: generate full frontmatter + markdown
    const typeConfig = getBlogTypeConfig(body.type || 'blog')
    if (!typeConfig) {
      res.status(400).json({ error: '未知博客类型' })
      return
    }

    const title = body.title || '未命名文章'
    const tags = Array.isArray(body.tags) && body.tags.length
      ? body.tags.map(tag => tag.trim()).filter(Boolean)
      : typeConfig.tags
    const categoryPath = Array.isArray(body.categoryPath) && body.categoryPath.length
      ? body.categoryPath.map(category => category.trim()).filter(Boolean)
      : typeConfig.categoryPath
    const date = nowString()
    const slug = slugify(body.slug || title)
    const sources = Array.isArray(body.sources) ? body.sources.filter(isExportSource) : []
    const markdown = appendSourceLinks(content, sources)
    const fullContent = `${frontMatter({
      title,
      date,
      slug,
      tags,
      categoryPath,
      mathjax: body.mathjax ?? typeConfig.mathjax,
      cover: typeConfig.cover,
      topImg: typeConfig.topImg,
    })}\n\n${markdown}\n`

    res.json({ content: fullContent, format: 'markdown' })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/export/wechat — markdown to WeChat HTML
router.post('/wechat', async (req, res) => {
  const { content } = req.body

  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'content 必填' })
  }

  try {
    const html = await markdownToWechatHTML(content)
    res.json({ html })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
