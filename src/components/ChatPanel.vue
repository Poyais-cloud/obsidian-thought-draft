<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useSessionStore } from '@/stores/session'
import { api } from '@/api'
import SourceModal from './SourceModal.vue'
import ExportDialog from './ExportDialog.vue'
import type { ClientSource, Message, SearchResult } from '@/types'
import { MODES, MODE_LABELS } from '@/types'

const chat = useChatStore()
const session = useSessionStore()

const input = ref('')
const chatContainer = ref<HTMLElement | null>(null)
const showExport = ref(false)
const exportContent = ref('')
const exportSources = ref<SearchResult[] | undefined>()
const draftForm = ref<{
  content: string; sources?: SearchResult[]; title: string; type: string
  slug: string; tags: string; categoryPath: string; mathjax: boolean
} | null>(null)
const exportingDraft = ref(false)
const draftPreviewing = ref(false)
const draftPreviewContent = ref('')

async function previewDraft() {
  if (!draftForm.value || draftPreviewing.value) return
  draftPreviewing.value = true
  draftPreviewContent.value = ''
  try {
    const result = await api.exportPreview({
      content: draftForm.value.content,
      title: draftForm.value.title,
      type: draftForm.value.type,
      slug: draftForm.value.slug,
      tags: parseList(draftForm.value.tags),
      categoryPath: draftForm.value.categoryPath ? [draftForm.value.categoryPath] : undefined,
      sources: (draftForm.value.sources || []).map(s => ({ sourceName: s.sourceName, sourcePath: s.sourcePath })),
      format: 'blog',
    })
    draftPreviewContent.value = result.content
  } catch (e: unknown) {
    draftPreviewContent.value = `预览失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    draftPreviewing.value = false
  }
}

const blogTypes = ['ClawTime', '编译原理', '大学物理', '操作系统', '前端', '数学', '博客维护']

const placeholders: Record<string, string> = {
  brainstorm: '聊聊你的想法、灵感、最近在思考的问题...',
  writing: '输入文章主题，Agent 会从你的笔记里检索素材来写...',
  connect: '输入关键词或话题，搜索笔记并生成双链建议...',
}

const msgs = computed(() => chat.currentMessages)
const loading = computed(() => chat.anyLoading)
const activeLoading = computed(() => chat.activeRunState(chat.mode) === 'running')
const runningModes = computed(() => MODES.filter(m => chat.activeRunState(m) === 'running'))

watch(() => msgs.value.length, () => {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
})

function inferTitle(content: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || '未命名文章'
}

function slugify(input: string): string {
  return input.trim().replace(/[\\/:*?"<>|#]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 80)
}

function parseList(input: string): string[] {
  return input.split(/[,，\n]/).map(item => item.trim()).filter(Boolean)
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return

  chat.lastQuery = text
  input.value = ''

  // In brainstorm mode, follow-up questions skip search and go directly to parallel generation
  const isFollowUp = chat.mode === 'brainstorm' && msgs.value.length > 0

  if (isFollowUp) {
    chat.runAllModes(text, msgs.value, [])
    return
  }

  // First message: search → show source modal → run all modes
  try {
    const results = await chat.search(text)
    chat.showSourceModal = true
    return
  } catch (err) {
    chat.error = (err as Error).message || '搜索失败'
  }
}

function onSourcesConfirmed(sources: ClientSource[]) {
  chat.confirmSources(sources)
  chat.runAllModes(chat.lastQuery, msgs.value, sources)
}

function onSourcesCancelled() {
  chat.showSourceModal = false
  // Generate without sources
  chat.runAllModes(chat.lastQuery, msgs.value, [])
}

function stop() {
  chat.abortAll()
}

function regenerate() {
  const userMsgs = msgs.value.filter(m => m.role === 'user')
  const lastUser = userMsgs[userMsgs.length - 1]
  if (!lastUser) return
  // Remove all messages from that user message onwards, then re-send
  const idx = msgs.value.indexOf(lastUser)
  chat.messagesByMode[chat.mode] = msgs.value.slice(0, idx)
  chat.runAllModes(lastUser.content, msgs.value.slice(0, idx), [])
}

async function copyMd(content: string) {
  await navigator.clipboard.writeText(content)
}

async function copyWechat(content: string) {
  try {
    const result = await api.exportWechat({ text: content })
    const html = result.html
    const blob = new Blob([html], { type: 'text/html' })
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': new Blob([content], { type: 'text/plain' }),
      }),
    ])
  } catch {
    chat.error = '复制公众号格式失败'
  }
}

function openDraftExport(content: string, sources?: SearchResult[]) {
  const title = inferTitle(content)
  draftForm.value = {
    content,
    sources,
    title,
    type: '前端',
    slug: slugify(title),
    tags: '博客, Hexo',
    categoryPath: '博客维护',
    mathjax: false,
  }
}

function selectDraftType(typeKey: string) {
  if (!draftForm.value) return
  draftForm.value.type = typeKey
}

async function exportBlogDraft() {
  if (!draftForm.value || exportingDraft.value) return
  exportingDraft.value = true
  try {
    const form = draftForm.value
    await api.exportBlog({
      messages: [{ role: 'assistant', content: form.content }],
      mode: chat.mode,
      title: form.title,
      blogType: form.type,
      tags: parseList(form.tags),
      category: form.categoryPath,
      slug: form.slug,
      vaultName: '学习笔记',
    })
    draftForm.value = null
  } catch (e) {
    chat.error = `导出失败: ${(e as Error).message}`
  } finally {
    exportingDraft.value = false
  }
}

async function writeLink(sourcePath: string, targetName: string) {
  try {
    await api.writeLink({ sourcePath, targetName })
  } catch {}
}

interface LinkSuggestion {
  fromName: string; toName: string; reason?: string
  from?: SearchResult; to?: SearchResult
}

function extractLinkSuggestions(content: string, sources: SearchResult[] | undefined): LinkSuggestion[] {
  const suggestions: LinkSuggestion[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/\[\[([^\]]+)\]\]\s*(?:←→|↔|<->|->|→)\s*\[\[([^\]]+)\]\]/)
    if (!match) continue
    const reasonLine = lines[i + 1]?.match(/^\s*原因[:：]\s*(.+)$/)
    suggestions.push({
      fromName: match[1].trim(),
      toName: match[2].trim(),
      reason: reasonLine?.[1]?.trim(),
      from: chat.findSourceByName(sources, match[1].trim()),
      to: chat.findSourceByName(sources, match[2].trim()),
    })
  }
  return suggestions
}

function stripLinkSuggestionText(content: string): string {
  const lines = content.split('\n')
  const kept: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const linkLine = lines[i].match(/\[\[([^\]]+)\]\]\s*(?:←→|↔|<->|->|→)\s*\[\[([^\]]+)\]\]/)
    if (linkLine) {
      if (lines[i + 1]?.match(/^\s*原因[:：]\s*(.+)$/)) i++
      continue
    }
    kept.push(lines[i])
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function displayContent(msg: Message): string {
  if (chat.mode === 'connect') return stripLinkSuggestionText(msg.content)
  if (chat.mode === 'writing') return linkInlineSources(msg.content, msg.sources)
  return msg.content
}

function linkInlineSources(content: string, sources: SearchResult[] | undefined): string {
  if (!sources?.length) return content
  return content.replace(/\(\[来源：《([^》]+)》\]\)/g, (_m, rawName: string) => {
    const source = chat.findSourceByName(sources, rawName)
    if (!source) return _m
    const href = chat.toObsidianUri(source.sourcePath)
    return `([来源：《${rawName}》](${href}))`
  })
}

function renderMarkdown(text: string): string {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Convert markdown links [text](url) — before other formatting so bold/italic in link text works
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="inline-link">$1</a>')
    // Convert bare https?:// URLs (not inside href="..." or existing <a> tags)
    .replace(/(?<![="'>])(https?:\/\/[^\s<>"')\]}，。]+)/g, '<a href="$1" target="_blank" rel="noopener" class="inline-link">$1</a>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:1em;font-weight:600;margin:0.4em 0 0.15em">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1.1em;font-weight:600;margin:0.5em 0 0.2em">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1.3em;font-weight:700;margin:0.6em 0 0.25em">$1</h1>')
    .replace(/^- (.+)$/gm, '<li style="margin:0.08em 0;line-height:1.65">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin:0.08em 0;line-height:1.65">$1. $2</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:650">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--accent-soft);padding:0.1em 0.3em;border-radius:3px;font-size:0.85em;font-family:monospace">$1</code>')
    .replace(/^>(.+)$/gm, '<blockquote style="border-left:2px solid var(--accent);padding-left:0.7em;color:var(--text-muted);margin:0.3em 0">$1</blockquote>')
    .replace(/\n\n/g, '</p><p style="margin:0.3em 0;line-height:1.75">')
    .replace(/\n/g, '<br>')

  html = '<p style="margin:0.3em 0;line-height:1.75">' + html + '</p>'
  html = html.replace(/<p[^>]*><p[^>]*>/g, '<p style="margin:0.3em 0;line-height:1.75">')
  html = html.replace(/<\/p><\/p>/g, '</p>')
  return html
}
</script>

<template>
  <div class="chat-panel">
    <div class="chat-messages-header" :style="{ borderColor: 'var(--border)' }">
      <div class="msg-status">
        <span class="msg-count" :style="{ color: 'var(--text-muted)' }">
          {{ msgs.length > 0 ? `${msgs.length} 条消息` : '新会话' }}
        </span>
        <span v-if="runningModes.length > 0" class="running-label" :style="{ color: 'var(--accent)' }">
          {{ runningModes.map(m => MODE_LABELS[m]).join(' / ') }} 生成中
        </span>
      </div>
    </div>

    <div ref="chatContainer" class="chat-messages">
      <div v-if="chat.error" class="error-banner">
        <span class="error-text">{{ chat.error }}</span>
        <el-button text size="small" @click="chat.error = ''">✕</el-button>
      </div>

      <div v-if="msgs.length === 0" class="welcome" :style="{ color: 'var(--text-muted)' }">
        <div class="welcome-icon" :style="{ color: 'var(--accent)' }">Thought Draft</div>
        <p>{{ placeholders[chat.mode] || '输入话题开始写作' }}</p>
      </div>

      <template v-for="(msg, i) in msgs" :key="msg.id || i">
        <div v-if="msg.role === 'user'" class="flex justify-end">
          <div class="msg-bubble user" :style="{ background: 'var(--user-bubble)', color: 'var(--user-text)' }">
            <div style="white-space: pre-wrap">{{ msg.content }}</div>
          </div>
        </div>

        <div
          v-else
          class="msg-bubble assistant"
          :class="{ 'full-width': chat.mode === 'writing' || chat.mode === 'connect' }"
          :style="(chat.mode === 'writing' || chat.mode === 'connect')
            ? {}
            : { background: 'var(--surface)', border: '1px solid var(--border)' }"
        >
          <!-- Connect mode: parsed link suggestions come first; raw suggestion text is hidden. -->
          <div
            v-if="chat.mode === 'connect' && msg.role === 'assistant' && extractLinkSuggestions(msg.content, msg.sources).length > 0"
            class="link-section"
          >
            <template v-for="link in extractLinkSuggestions(msg.content, msg.sources)" :key="`${link.fromName}-${link.toName}`">
              <div class="link-row" :style="{ background: 'var(--accent-soft)' }">
                <div class="link-info">
                  <div class="link-names" :style="{ color: 'var(--text)' }">
                    [[{{ link.fromName }}]] ←→ [[{{ link.toName }}]]
                  </div>
                  <div v-if="link.reason" class="link-reason" :style="{ color: 'var(--text-muted)' }">{{ link.reason }}</div>
                </div>
                <button
                  v-if="link.from"
                  class="link-write-btn"
                  :style="{ background: 'var(--accent)', color: '#fff' }"
                  @click="writeLink(link.from!.sourcePath, link.toName)"
                >写入</button>
              </div>
            </template>
          </div>

          <!-- Source display: in connect mode this sits directly under the suggestions. -->
          <div v-if="chat.mode === 'connect' && msg.sources && msg.sources.length > 0" class="sources-section connect-sources" :style="{ borderColor: 'var(--border)' }">
            <div class="sources-title" :style="{ color: 'var(--text-muted)' }">
              引用来源
              <template v-if="msg.sourceDismissed?.length">
                ({{ Math.max(0, msg.sources.length - msg.sourceDismissed.length) }}/{{ msg.sources.length }})
              </template>
              <template v-else>
                ({{ Math.min(msg.sourceVisible || 15, msg.sources.length) }}/{{ msg.sources.length }})
              </template>
            </div>
            <div
              v-for="(src, si) in msg.sources"
              :key="si"
              v-show="!msg.sourceDismissed?.includes(si) && si < (msg.sourceVisible || 15)"
              class="source-row"
              :style="{ background: 'var(--accent-soft)' }"
            >
              <span class="source-score" :style="{ color: 'var(--accent)' }">{{ src.score.toFixed(2) }}</span>
              <a :href="chat.toObsidianUri(src.sourcePath)" class="source-link" :style="{ color: 'var(--accent)' }" target="_blank">
                {{ src.sourceName }}
              </a>
              <span class="source-snippet" :style="{ color: 'var(--text-muted)' }">{{ src.snippet.slice(0, 80) }}</span>
              <button class="source-dismiss" :style="{ color: 'var(--text-muted)' }" @click="chat.dismissSource(msg.id, si)">✕</button>
            </div>
          </div>

          <div
            v-if="displayContent(msg)"
            class="markdown-body"
            v-html="renderMarkdown(displayContent(msg))"
            :style="{ color: 'var(--text)' }"
          />

          <div
            v-if="msg.role === 'assistant' && msg.content && activeLoading && i === msgs.length - 1"
            class="streaming-dot" :style="{ background: 'var(--accent)' }"
          />

          <!-- Per-message actions -->
          <div v-if="msg.content && msg.role === 'assistant'" class="msg-actions" :style="{ borderColor: 'var(--border)' }">
            <button class="action-btn" :style="{ color: 'var(--text-muted)' }" @click="copyMd(msg.content)">复制 MD</button>
            <button class="action-btn" :style="{ color: 'var(--accent-warm)' }" @click="copyWechat(msg.content)">复制公众号</button>
            <template v-if="chat.mode === 'writing'">
              <button class="action-btn" :style="{ color: 'var(--text-muted)' }" :disabled="loading" @click="regenerate">重新生成</button>
              <button class="action-btn" :style="{ color: 'var(--vault-blog, #c9a64c)' }" @click="openDraftExport(msg.content, msg.sources)">导出草稿</button>
            </template>
          </div>

          <!-- Source display -->
          <div v-if="chat.mode !== 'connect' && msg.sources && msg.sources.length > 0" class="sources-section" :style="{ borderColor: 'var(--border)' }">
            <div class="sources-title" :style="{ color: 'var(--text-muted)' }">
              引用来源
              <template v-if="msg.sourceDismissed?.length">
                ({{ Math.max(0, msg.sources.length - msg.sourceDismissed.length) }}/{{ msg.sources.length }})
              </template>
              <template v-else>
                ({{ Math.min(msg.sourceVisible || 15, msg.sources.length) }}/{{ msg.sources.length }})
              </template>
            </div>
            <div
              v-for="(src, si) in msg.sources"
              :key="si"
              v-show="!msg.sourceDismissed?.includes(si) && si < (msg.sourceVisible || 15)"
              class="source-row"
              :style="{ background: 'var(--accent-soft)' }"
            >
              <span class="source-score" :style="{ color: 'var(--accent)' }">{{ src.score.toFixed(2) }}</span>
              <a :href="chat.toObsidianUri(src.sourcePath)" class="source-link" :style="{ color: 'var(--accent)' }" target="_blank">
                {{ src.sourceName }}
              </a>
              <span class="source-snippet" :style="{ color: 'var(--text-muted)' }">{{ src.snippet.slice(0, 80) }}</span>
              <button class="source-dismiss" :style="{ color: 'var(--text-muted)' }" @click="chat.dismissSource(msg.id, si)">✕</button>
            </div>
          </div>
        </div>
      </template>

      <!-- Loading state -->
      <div v-if="loading" class="loading-bar" :style="{ color: 'var(--text-muted)' }">
        <span v-if="activeLoading">{{ MODE_LABELS[chat.mode] }}生成中</span>
        <span v-else>其他模式生成中: {{ runningModes.map(m => MODE_LABELS[m]).join(' / ') }}</span>
        <span class="dot-pulse">...</span>
        <button class="stop-btn" :style="{ color: 'var(--text-muted)' }" @click="stop">停止</button>
      </div>
    </div>

    <!-- Input area -->
    <div class="chat-input-area" :style="{ background: 'var(--surface)', borderColor: 'var(--border)' }">
      <div class="input-row">
        <textarea
          v-if="chat.mode === 'writing'"
          v-model="input"
          :placeholder="placeholders[chat.mode]"
          rows="2"
          class="chat-input"
          :style="{
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            resize: 'none',
          }"
          @keydown.enter.exact.prevent="send()"
        />
        <input
          v-else
          v-model="input"
          :placeholder="placeholders[chat.mode]"
          class="chat-input"
          :style="{
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
          }"
          @keydown.enter.prevent="send()"
        />
      </div>
      <div class="input-actions">
        <span class="input-hint" :style="{ color: 'var(--text-muted)' }">Enter 发送 · Shift+Enter 换行</span>
        <el-button
          type="primary"
          size="small"
          @click="send"
          :disabled="!input.trim() || loading"
        >发送</el-button>
      </div>
    </div>

    <!-- Source Review Modal -->
    <SourceModal
      v-if="chat.showSourceModal"
      :results="chat.searchResults"
      :query="chat.lastQuery"
      @confirm="onSourcesConfirmed"
      @close="onSourcesCancelled"
    />

    <!-- Blog Draft Export Modal (inline form like React version) -->
    <el-dialog
      v-if="draftForm"
      :model-value="true"
      title="导出到博客草稿"
      width="min(480px, 92vw)"
      @close="draftForm = null"
    >
      <div class="draft-form">
        <label class="field">
          <span class="field-label" :style="{ color: 'var(--text-muted)' }">标题</span>
          <el-input
            v-model="draftForm.title"
            size="small"
            @change="draftForm!.slug = slugify(draftForm!.title)"
          />
        </label>
        <div class="form-row-2col">
          <label class="field">
            <span class="field-label" :style="{ color: 'var(--text-muted)' }">类型</span>
            <el-select v-model="draftForm.type" size="small" style="width: 100%">
              <el-option v-for="t in blogTypes" :key="t" :label="t" :value="t" />
            </el-select>
          </label>
          <label class="field">
            <span class="field-label" :style="{ color: 'var(--text-muted)' }">Slug</span>
            <el-input v-model="draftForm.slug" size="small" />
          </label>
        </div>
        <label class="field">
          <span class="field-label" :style="{ color: 'var(--text-muted)' }">标签</span>
          <el-input v-model="draftForm.tags" size="small" placeholder="逗号分隔" />
        </label>
        <label class="field">
          <span class="field-label" :style="{ color: 'var(--text-muted)' }">分类路径</span>
          <el-input v-model="draftForm.categoryPath" size="small" />
        </label>
        <div class="field-check">
          <el-checkbox v-model="draftForm.mathjax" size="small" />
          <span :style="{ color: 'var(--text-muted)', fontSize: '13px' }">启用 MathJax</span>
        </div>
        <div class="draft-hint" :style="{ color: 'var(--text-muted)', fontSize: '12px' }">
          将写入 source/_drafts/{{ draftForm.type }}/。发布前仍需在博客仓库运行预览。
        </div>

        <div v-if="draftPreviewContent" class="draft-preview-panel" :style="{ borderColor: 'var(--border)', background: 'var(--surface)' }">
          <div class="draft-preview-header" :style="{ borderColor: 'var(--border)' }">
            <span class="draft-preview-label">预览</span>
            <el-button text size="small" @click="draftPreviewContent = ''">收起</el-button>
          </div>
          <pre class="draft-preview-code" :style="{ color: 'var(--text)', background: 'var(--bg)' }">{{ draftPreviewContent }}</pre>
        </div>
      </div>
      <template #footer>
        <el-button @click="draftForm = null">取消</el-button>
        <el-button :loading="draftPreviewing" @click="previewDraft">预览</el-button>
        <el-button type="primary" :loading="exportingDraft" @click="exportBlogDraft">写入草稿</el-button>
      </template>
    </el-dialog>

    <!-- Export Dialog (general) -->
    <ExportDialog
      v-if="showExport"
      :messages="msgs"
      @close="showExport = false"
    />
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-messages-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  border-bottom: 1px solid;
  flex-shrink: 0;
}

.msg-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.msg-count {
  font-size: 12px;
}

.running-label {
  font-size: 12px;
  font-weight: 500;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  font-size: 14px;
}

.welcome-icon {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
}

.msg-bubble {
  margin-bottom: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  max-width: 85%;
  font-size: 14px;
  line-height: 1.65;
  animation: fadeIn 0.25s ease-out;
}

.msg-bubble.user {
  margin-left: auto;
  border-bottom-right-radius: 4px;
}

.msg-bubble.assistant {
  margin-right: auto;
  border-bottom-left-radius: 4px;
}

.msg-bubble.full-width {
  max-width: 100%;
  padding: 2px 0;
}

.flex { display: flex; }
.justify-end { justify-content: flex-end; }

.streaming-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: 4px;
  vertical-align: middle;
  animation: pulse 0.8s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.msg-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid;
  align-items: center;
}

.action-btn {
  font-size: 12px;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: none;
  padding: 0;
}

.action-btn:hover { text-decoration: underline; }

:deep(.inline-link) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

:deep(.inline-link:hover) {
  color: var(--accent-hover, var(--accent));
}
.action-btn:disabled { opacity: 0.4; cursor: default; }

.sources-section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid;
}

.sources-title {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 6px;
}

.source-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 12px;
}

.source-score {
  font-family: monospace;
  flex-shrink: 0;
  font-weight: 500;
}

.source-link {
  flex-shrink: 0;
  font-weight: 500;
  text-decoration: none;
}

.source-link:hover { text-decoration: underline; }

.source-snippet {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-dismiss {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  opacity: 0;
}

.source-row:hover .source-dismiss { opacity: 1; }

.link-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 12px;
}

.link-info { min-width: 0; }

.link-names {
  font-weight: 500;
  margin-bottom: 2px;
}

.link-reason {
  font-size: 11px;
}

.link-write-btn {
  flex-shrink: 0;
  border: none;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.connect-sources {
  margin-top: 0;
  margin-bottom: 10px;
}

.error-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 10px;
  background: var(--user-bubble-warn, #fff3cd);
  border: 1px solid var(--accent-warm, #ffc107);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
}

.error-text {
  color: var(--error-text, #856404);
  flex: 1;
}

.loading-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 4px 0;
}

.dot-pulse {
  font-weight: bold;
  animation: pulse 0.6s ease-in-out infinite;
}

.stop-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline;
}

.chat-input-area {
  border-top: 1px solid;
  padding: 10px 16px;
  flex-shrink: 0;
}

.input-row { margin-bottom: 6px; }

.chat-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
}

.input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.input-hint {
  font-size: 12px;
}

.draft-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field { display: flex; flex-direction: column; gap: 4px; }
.field-label { font-size: 12px; }

.form-row-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.field-check {
  display: flex;
  align-items: center;
  gap: 6px;
}

.draft-hint {
  padding: 6px 0;
}

.draft-preview-panel {
  margin-top: 8px;
  border: 1px solid;
  border-radius: 8px;
  overflow: hidden;
}

.draft-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  border-bottom: 1px solid;
  font-size: 12px;
}

.draft-preview-label {
  font-weight: 600;
  color: var(--text);
}

.draft-preview-code {
  margin: 0;
  padding: 12px;
  max-height: 300px;
  overflow-y: auto;
  font-size: 12px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 767px) {
  .chat-messages {
    padding: 10px;
  }

  .msg-bubble {
    max-width: 92%;
    font-size: 13px;
    padding: 8px 12px;
  }

  .msg-bubble.user {
    max-width: 88%;
  }

  .msg-actions {
    flex-wrap: wrap;
    gap: 6px;
  }

  .source-row {
    flex-wrap: wrap;
    gap: 4px;
  }

  .source-snippet {
    flex-basis: 100%;
  }

  .chat-input-area {
    padding: 8px 10px;
  }

  .chat-input {
    font-size: 13px;
  }

  .form-row-2col {
    grid-template-columns: 1fr;
  }
}
</style>
