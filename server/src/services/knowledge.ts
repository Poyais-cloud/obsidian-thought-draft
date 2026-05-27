import fs from 'node:fs'
import path from 'node:path'
import MiniSearch, { type SearchResult as MiniSearchResult } from 'minisearch'

function dataDir() { return path.join(process.cwd(), 'data') }
function indexFile() { return path.join(dataDir(), 'knowledge.json') }

interface ChunkMeta { sourceName: string; sourcePath: string; fileMtime: number }
interface IndexedChunk {
  id: string
  title: string
  text: string
  sourceName: string
  sourcePath: string
  snippet: string
}
type StoredSearchResult = MiniSearchResult & Partial<Pick<IndexedChunk, 'sourceName' | 'sourcePath' | 'snippet'>>

type OdfGlobal = typeof globalThis & {
  __ofd_ms?: MiniSearch<IndexedChunk>
  __ofd_meta?: Map<string, ChunkMeta>
}

const g = globalThis as OdfGlobal

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })

function tokenize(s: string): string[] {
  return [...segmenter.segment(s)]
    .filter(x => x.isWordLike)
    .map(x => x.segment.toLowerCase())
    .filter(t => t.length >= 2)
}

export function extractTitle(text: string, filename: string): string {
  const h1 = text.match(/^#\s+(.+)$/m)
  if (h1) return h1[1].trim()
  return filename.replace(/\.md$/, '')
}

function chunkText(text: string, maxSize = 600, overlap = 120): string[] {
  const chunks: string[] = []
  const paragraphs = text.split(/\n\s*\n/)
  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue
    if (trimmed.length <= maxSize) { chunks.push(trimmed); continue }
    const sentences = trimmed.split(/(?<=[。！？!?；;])\s*/)
    let cur = ''
    for (const s of sentences) {
      if (!s.trim()) continue
      if (cur.length + s.length <= maxSize) { cur += s } else {
        if (cur.trim()) chunks.push(cur.trim())
        cur = cur.slice(-overlap) + s
      }
    }
    if (cur.trim()) chunks.push(cur.trim())
  }
  return chunks.filter(c => c.length > 0)
}

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }

function createMS(): MiniSearch<IndexedChunk> {
  return new MiniSearch({
    fields: ['title', 'text'],
    storeFields: ['sourceName', 'sourcePath', 'snippet'],
    tokenize,
    searchOptions: {
      boost: { title: 4 },
      prefix: true,
      fuzzy: 0.2,
    },
  })
}

let ms: MiniSearch<IndexedChunk> | null = g.__ofd_ms || null
let meta: Map<string, ChunkMeta> | null = g.__ofd_meta || null

export function loadIndex() {
  if (ms) return
  if (process.env.NODE_ENV === 'test' && process.env.OFD_LOAD_REAL_INDEX !== '1') return
  try {
    if (fs.existsSync(indexFile())) {
      const t0 = Date.now()
      const raw = JSON.parse(fs.readFileSync(indexFile(), 'utf-8'))

      ms = MiniSearch.loadJSON(JSON.stringify(raw.searchIndex), {
        fields: ['title', 'text'],
        storeFields: ['sourceName', 'sourcePath', 'snippet'],
        tokenize,
        searchOptions: { boost: { title: 4 }, prefix: true, fuzzy: 0.2 },
      })

      meta = new Map(raw.meta || [])
      g.__ofd_ms = ms
      g.__ofd_meta = meta
      console.log(`[知识库] ${ms.documentCount} 文档, ${meta.size} 元数据 (${Date.now() - t0}ms)`)
    }
  } catch (e) {
    console.error('[知识库] 加载失败:', e)
  }
}

function saveIndex() {
  if (!ms) return
  if (!fs.existsSync(dataDir())) fs.mkdirSync(dataDir(), { recursive: true })
  const serialized = {
    searchIndex: JSON.parse(JSON.stringify(ms)),
    meta: meta ? [...meta.entries()] : [],
  }
  fs.writeFileSync(indexFile(), JSON.stringify(serialized), 'utf-8')
}

function walkMd(dir: string): { name: string; path: string; mtime: number }[] {
  const files: { name: string; path: string; mtime: number }[] = []
  const walk = (d: string) => {
    let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const full = path.join(d, e.name)
      if (e.isDirectory()) { walk(full) }
      else if (e.isFile() && e.name.endsWith('.md')) {
        const stat = fs.statSync(full)
        files.push({ name: e.name, path: full, mtime: Math.round(stat.mtimeMs) })
      }
    }
  }
  walk(dir)
  return files
}

function readFile(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf-8') } catch { return null }
}

export async function indexVault(
  name: string,
  vaultPath: string,
  onProgress?: (phase: string, detail?: { current?: number; total?: number }) => void
): Promise<{ indexed: number; skipped: number; fragments: number }> {
  onProgress?.('scanning')
  const files = walkMd(vaultPath)
  loadIndex()

  if (!ms) { ms = createMS(); meta = new Map() }
  if (!meta) meta = new Map()

  const vaultIds: string[] = []
  for (const [id, m] of meta) {
    if (m.sourcePath.startsWith(vaultPath)) vaultIds.push(id)
  }

  const existingByPath = new Map<string, { id: string; mtime: number }[]>()
  for (const id of vaultIds) {
    const m = meta.get(id)!
    if (!existingByPath.has(m.sourcePath)) existingByPath.set(m.sourcePath, [])
    existingByPath.get(m.sourcePath)!.push({ id, mtime: m.fileMtime })
  }

  let skipped = 0
  let rebuilt = 0
  const toRemove: string[] = []
  const indexedPaths = new Set(files.map(f => f.path))
  for (const id of vaultIds) {
    const m = meta.get(id)!
    if (!indexedPaths.has(m.sourcePath)) toRemove.push(id)
  }

  const toAdd: IndexedChunk[] = []

  const total = files.length
  onProgress?.('reading', { current: 0, total })

  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const existing = existingByPath.get(f.path)

    if (existing && existing.length > 0 && existing[0].mtime === f.mtime) {
      skipped += existing.length
      continue
    }

    if (existing) {
      rebuilt += existing.length
      toRemove.push(...existing.map(e => e.id))
    }

    const content = readFile(f.path)
    if (!content) continue
    const title = extractTitle(content, f.name)
    const parts = chunkText(content)
    for (const part of parts) {
      const id = uid()
      toAdd.push({
        id, title, text: part,
        sourceName: f.name, sourcePath: f.path, snippet: part.slice(0, 300),
      })
      meta!.set(id, { sourceName: f.name, sourcePath: f.path, fileMtime: f.mtime })
    }

    if ((i + 1) % 10 === 0 || i === total - 1) {
      onProgress?.('reading', { current: i + 1, total })
    }
  }

  onProgress?.('building')
  if (toRemove.length > 0) {
    ms.discardAll(toRemove)
    for (const id of toRemove) meta!.delete(id)
  }

  if (toAdd.length > 0) ms.addAll(toAdd)
  g.__ofd_ms = ms
  g.__ofd_meta = meta

  onProgress?.('saving')
  saveIndex()

  const fragments = toAdd.length + skipped
  console.log(`[索引] ${name}: ${files.length} 文件 → ${fragments} 片段 (跳过 ${skipped} 未变, 重建 ${rebuilt})`)
  return { indexed: rebuilt, skipped, fragments }
}

interface SearchResult {
  score: number
  sourceName: string
  sourcePath: string
  snippet: string
}

export function search(query: string, topK = 5, vaultFilter?: string): SearchResult[] {
  loadIndex()
  if (!ms || !ms.documentCount) return []

  const results = ms.search(query, { prefix: true, fuzzy: 0.2, boost: { title: 4 } })

  const seen = new Set<string>()
  const deduped: SearchResult[] = []

  for (const r of results as StoredSearchResult[]) {
    const sp = r.sourcePath || String(r.id)
    if (vaultFilter && !sp.startsWith(vaultFilter)) continue
    if (seen.has(sp)) continue
    seen.add(sp)
    deduped.push({
      score: Number(r.score.toFixed(2)),
      sourceName: r.sourceName || String(r.id),
      sourcePath: sp,
      snippet: r.snippet || '',
    })
  }

  return deduped.slice(0, topK)
}

export function searchAll(query: string, topK = 10, vaultFilter?: string): SearchResult[] {
  loadIndex()
  if (!ms || !ms.documentCount) return []

  const results = ms.search(query, { prefix: true, fuzzy: 0.2, boost: { title: 4 } })

  return (results as StoredSearchResult[])
    .filter(r => !vaultFilter || (r.sourcePath || String(r.id)).startsWith(vaultFilter))
    .slice(0, topK)
    .map(r => ({
      score: Number(r.score.toFixed(2)),
      sourceName: r.sourceName || String(r.id),
      sourcePath: r.sourcePath || String(r.id),
      snippet: r.snippet || '',
    }))
}
