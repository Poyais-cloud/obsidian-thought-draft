import { Router } from 'express'
import { createOpenAI } from '@ai-sdk/openai'
import { streamText, type ModelMessage } from 'ai'
import { searchAll } from '../services/knowledge'

const deepseek = createOpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY,
  name: 'deepseek',
})

const BRAINSTORM_PROMPT = `你是用户的思考搭子，不是客服、不是总结机器人、也不是公众号写手。用户给你一个问题或念头，你要像一个熟悉他笔记的人，帮他把里面真正有意思的地方翻出来。

规则：
1. 不要用"首先/其次/综上/我们可以看到/这体现了"这类 AI 套话。
2. 不要平均分点。先抓住问题里最别扭、最有张力的一点，像聊天一样开场。
3. 引用笔记时要自然，像"你之前在《xxx》里其实已经碰到过这个问题"，不要硬凑来源。
4. 资料不够时直接说"这里材料不够"，不要编。
5. 要有你的判断：哪些线索重要，哪些只是噪音，为什么。
6. 可以有停顿、转折、反问，但不要装腔。语气接近一个聪明朋友认真帮你想。
7. 默认写 600-1000 字，有密度，但不要为了显得完整而铺模板。

输出结构可以自由，但通常应该包含：
- 一个真正的问题重述，不超过 2 段；
- 3-6 条从笔记里拉出来的线索或关联；
- 1-2 个反向视角；
- 几个下一步可追问的问题。`

const WRITING_PROMPT = `你是博客草稿编辑。你的工作不是替用户写一篇漂亮范文，而是把用户筛选过的笔记素材整理成一篇可以继续修改的博客草稿。

<writing_style>
- 使用论述视角或第三人称视角，不使用第一人称替作者表态。
- 开头从一个具体问题、矛盾或场景切入，不要从宏大背景切入。
- 句子长短自然变化，不要整齐排比，不要把每段都写成"观点 + 解释 + 升华"。
- 判断必须落在具体材料上：哪篇笔记提供了什么线索，它为什么重要。
- 每个使用了笔记素材的句子或段落，必须在相关语句后面直接标注来源，例如：这说明问题并不只在工具，而在判断标准。([来源：《文件名.md》])
- 小标题要像人在整理文章时写出来的概括，不要像公文提纲。
- 读起来应该像整理过的长期笔记：清楚、克制、有取舍，不像演讲稿、宣传稿或课程讲义。
</writing_style>

<bad_to_good_examples>
坏：在当今时代，AI 正在深刻改变我们的生活与工作方式。
好：AI 写作真正麻烦的地方，不是它写不出东西，而是它太容易把所有问题写平。

坏：我们可以看到，这一现象具有重要意义。
好：这几篇笔记共同指向一个问题：真正难的不是工具选择，而是判断什么值得保留下来。

坏：本文将从三个方面展开分析。
好：这个问题可以先拆成三层：材料从哪里来、判断怎么形成、最后要落到什么行动上。

坏：综上所述，这对个人成长具有重要启示。
好：如果只停在方法总结，这件事就会变成又一套清单。更关键的是，它逼着人检查自己的判断依据。
</bad_to_good_examples>

<rules>
1. 文章素材必须来自知识库资料中的内容，引用时在正文内联标注笔记来源。
2. 不要使用"我认为"、"我觉得"、"我们可以看到"、"本文将"。
3. 可以保留材料里的个人观察，但要改写成客观叙述或第三人称表达。
4. 不要把来源都堆到文章末尾；来源要贴在具体使用它的语句之后。
5. 同一段如果连续使用同一篇笔记，可以段末标一次；如果一段混合多篇笔记，要分别标注。
6. 不要为了完整而硬写引言和结语；材料不足时宁可短一点，也不要编。
7. 末尾可以保留"引用来源"小节，但不能替代正文内联来源标注。
</rules>`

const CONNECT_PROMPT = `你是知识连接助手。用户已经筛过候选笔记，你要基于这些笔记梳理出真正值得写入 Obsidian 的关联，不要为了凑数硬连。

输出格式：
[[完整文件名A.md]] ←→ [[完整文件名B.md]]
原因：一句话说明共同话题

规则：
1. 优先覆盖资料中列出的多数文章，但不强行覆盖明显无关的文章。
2. 不只连接同义词，也要寻找主题、问题、方法、案例、人物、时间线、因果、反差、补充材料之间的关系。
3. 只使用资料中出现的精确文件名，不能编造文件名。
4. 输出 5-12 组高质量关联；如果资料不足，可以少于 5 组。
5. 只输出关联清单，不要写长篇分析或文章。`

type ClientMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ClientSource = {
  sourceName: string
  sourcePath: string
  snippet: string
  score?: number
}

type ContextSource = {
  sourceName: string
  sourcePath: string
  snippet: string
}

function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return (
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string'
  )
}

function isClientSource(value: unknown): value is ClientSource {
  if (!value || typeof value !== 'object') return false
  const source = value as Record<string, unknown>
  return (
    typeof source.sourceName === 'string' &&
    typeof source.sourcePath === 'string' &&
    typeof source.snippet === 'string'
  )
}

function groupBySource(results: ContextSource[], maxSnippets: number, snippetLength: number): string[] {
  const bySource = new Map<string, { sourceName: string; snippets: string[] }>()
  for (const r of results) {
    const current = bySource.get(r.sourcePath) || { sourceName: r.sourceName, snippets: [] }
    if (current.snippets.length < maxSnippets) {
      current.snippets.push(r.snippet.slice(0, snippetLength))
    }
    bySource.set(r.sourcePath, current)
  }

  return [...bySource.values()].map((r, i) => {
    const snippets = r.snippets.map((s, j) => `  片段${j + 1}: ${s}`).join('\n')
    return `${i + 1}. [${r.sourceName}]\n${snippets}`
  })
}

function buildContext(query: string, mode: string, vaultFilter?: string, selectedSources?: ClientSource[]): string {
  const count = mode === 'writing' ? 24 : mode === 'connect' ? 36 : 28
  const results = selectedSources !== undefined ? selectedSources : searchAll(query, count, vaultFilter)
  if (!results.length) return ''

  if (mode === 'writing') {
    return [
      '以下是用户知识库中的相关笔记内容：',
      ...results.map((r, i) => `${i + 1}. [${r.sourceName}] ${r.snippet.slice(0, 300)}`),
      '请基于以上资料撰写文章。凡是使用某篇笔记中的信息、观点、例子或措辞，都要在对应语句后面直接加来源标注，格式为 ([来源：《文件名.md》])。',
    ].join('\n')
  }

  if (mode === 'connect') {
    return [
      `用户问题：${query}`,
      '以下是检索到的候选文章。请尽力梳理它们之间的多种关系，构建可写入 Obsidian 的双链建议：',
      ...groupBySource(results, 3, 220),
      '请优先覆盖以上文章，输出关联网络，而不是只挑最相似的两三篇。',
    ].join('\n')
  }

  return [
    `用户问题：${query}`,
    '以下是用户知识库中可能相关的笔记线索。它们不一定都直接回答问题，请主动抽象、对照和连接：',
    ...groupBySource(results, 2, 280),
    '请不要只复述资料。请基于这些线索做深度头脑风暴：提出结构、关联、反向视角和可继续推进的问题。',
  ].join('\n')
}

function generationSettings(mode: string) {
  if (mode === 'writing') {
    return { temperature: 0.55, maxOutputTokens: 3200 }
  }
  if (mode === 'connect') {
    return { temperature: 0.35, maxOutputTokens: 2000 }
  }
  return { temperature: 0.85, maxOutputTokens: 2400 }
}

const router = Router()

router.post('/', async (req, res) => {
  if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === 'sk-your-deepseek-api-key-here') {
    res.status(401).json({ error: '未配置 API Key，请将 server/.env.example 重命名为 server/.env 并填入你的 DeepSeek API Key。获取地址: https://platform.deepseek.com/api_keys' })
    return
  }

  const { messages, mode, vault, switched, sources } = req.body
  const msgs = Array.isArray(messages) ? messages.filter(isClientMessage) : []
  const selectedSources = Array.isArray(sources) ? sources.filter(isClientSource) : undefined

  const lastUser = [...msgs].reverse().find(m => m.role === 'user')
  const context = lastUser ? buildContext(lastUser.content, mode, vault, selectedSources) : ''

  const prompt =
    mode === 'writing' ? WRITING_PROMPT :
    mode === 'connect' ? CONNECT_PROMPT :
    BRAINSTORM_PROMPT

  const recentMsgs = switched ? msgs.slice(-2) : msgs

  const systemMessages: ModelMessage[] = [
    { role: 'system' as const, content: prompt },
    ...(context ? [{ role: 'system' as const, content: context }] : []),
    ...recentMsgs,
  ]

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    const result = streamText({
      model: deepseek.chat('deepseek-chat'),
      messages: systemMessages,
      ...generationSettings(mode),
    })

    for await (const chunk of result.textStream) {
      res.write(`data: ${JSON.stringify({ type: 'text-delta', textDelta: chunk })}\n\n`)
    }
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('[chat] SSE error:', (err as Error).message)
    if (!res.headersSent) {
      res.status(500).json({ error: (err as Error).message || 'AI 服务调用失败' })
    } else {
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', error: (err as Error).message || 'AI 服务调用失败' })}\n\n`)
      } catch {}
      res.end()
    }
  }
})

export default router
