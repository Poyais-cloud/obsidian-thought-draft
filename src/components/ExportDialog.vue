<script setup lang="ts">
import { ref } from 'vue'
import { api } from '@/api'
import { useChatStore } from '@/stores/chat'
import type { ClientMessage } from '@/types'

const props = defineProps<{
  messages: ClientMessage[]
}>()

const emit = defineEmits<{ close: [] }>()

const chat = useChatStore()
const exporting = ref(false)
const exportResult = ref('')

const blogForm = ref({
  title: '',
  blogType: '前端',
  tags: '',
  category: '',
  slug: '',
  vaultName: '学习笔记',
})

const blogTypes = ['ClawTime', '编译原理', '大学物理', '操作系统', '前端', '数学', '博客维护']

// Preview state
const previewContent = ref('')
const previewFormat = ref<'blog' | 'wechat' | 'markdown'>('markdown')
const previewing = ref(false)

function gatherAssistantContent(): string {
  return props.messages
    .filter(m => m.role === 'assistant')
    .map(m => m.content)
    .join('\n\n')
}

function gatherAllContent(): string {
  return props.messages.map(m => m.content).join('\n\n---\n\n')
}

async function previewBlog() {
  previewing.value = true
  previewFormat.value = 'blog'
  try {
    const content = gatherAssistantContent()
    if (!content) { previewContent.value = '（无内容可预览）'; return }
    const result = await api.exportPreview({
      content,
      title: blogForm.value.title || undefined,
      type: blogForm.value.blogType,
      slug: blogForm.value.slug || undefined,
      tags: blogForm.value.tags ? blogForm.value.tags.split(',').map(s => s.trim()) : undefined,
      categoryPath: blogForm.value.category ? [blogForm.value.category] : undefined,
      format: 'blog',
    })
    previewContent.value = result.content
  } catch (e: unknown) {
    previewContent.value = `预览失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    previewing.value = false
  }
}

async function previewWechat() {
  previewing.value = true
  previewFormat.value = 'wechat'
  try {
    const content = gatherAssistantContent()
    if (!content) { previewContent.value = '（无内容可预览）'; return }
    const result = await api.exportPreview({
      content,
      format: 'wechat',
    })
    previewContent.value = result.content
  } catch (e: unknown) {
    previewContent.value = `预览失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    previewing.value = false
  }
}

async function previewMarkdown() {
  previewing.value = true
  previewFormat.value = 'markdown'
  try {
    const content = gatherAllContent()
    if (!content) { previewContent.value = '（无内容可预览）'; return }
    const result = await api.exportPreview({
      content,
      format: 'markdown',
    })
    previewContent.value = result.content
  } catch (e: unknown) {
    previewContent.value = `预览失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    previewing.value = false
  }
}

async function exportBlog() {
  exporting.value = true
  try {
    const result = await api.exportBlog({
      messages: props.messages,
      mode: chat.mode,
      title: blogForm.value.title || undefined,
      blogType: blogForm.value.blogType,
      tags: blogForm.value.tags ? blogForm.value.tags.split(',').map(s => s.trim()) : undefined,
      category: blogForm.value.category || undefined,
      slug: blogForm.value.slug || undefined,
      vaultName: blogForm.value.vaultName,
    })
    exportResult.value = `已导出到: ${result.path}`
  } catch (e: unknown) {
    exportResult.value = `导出失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    exporting.value = false
  }
}

async function exportWechat() {
  exporting.value = true
  try {
    const text = gatherAssistantContent()
    const result = await api.exportWechat({ text })
    await navigator.clipboard.writeText(result.html)
    exportResult.value = '已复制富文本到剪贴板'
  } catch (e: unknown) {
    exportResult.value = `导出失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    exporting.value = false
  }
}

function downloadMd() {
  const text = gatherAllContent()
  const blob = new Blob([text], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `draft-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <el-dialog
    title="导出分发"
    :model-value="true"
    width="min(520px, 92vw)"
    @close="$emit('close')"
  >
    <el-tabs>
      <el-tab-pane label="Hexo 博客草稿">
        <div class="export-form">
          <div class="form-row">
            <span class="form-label">标题</span>
            <el-input v-model="blogForm.title" size="small" placeholder="可选，默认使用首条消息" />
          </div>
          <div class="form-row">
            <span class="form-label">博客类型</span>
            <el-select v-model="blogForm.blogType" size="small" style="width: 140px">
              <el-option v-for="t in blogTypes" :key="t" :label="t" :value="t" />
            </el-select>
          </div>
          <div class="form-row">
            <span class="form-label">标签</span>
            <el-input v-model="blogForm.tags" size="small" placeholder="逗号分隔" />
          </div>
          <div class="form-row">
            <span class="form-label">分类路径</span>
            <el-input v-model="blogForm.category" size="small" placeholder="如 tech/frontend" />
          </div>
          <div class="form-row">
            <span class="form-label">固定链接</span>
            <el-input v-model="blogForm.slug" size="small" placeholder="可选" />
          </div>
          <div class="form-actions">
            <el-button size="small" text :loading="previewing" @click="previewBlog">预览</el-button>
            <el-button
              type="primary"
              size="small"
              :loading="exporting"
              @click="exportBlog"
            >
              导出到博客草稿
            </el-button>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="公众号格式">
        <div class="export-section">
          <p :style="{ color: 'var(--text-muted)', fontSize: '13px' }">
            将 AI 助手回复转为 CSS 内联的 HTML 富文本，可直接粘贴到公众号编辑器。
          </p>
          <div class="form-actions">
            <el-button size="small" text :loading="previewing" @click="previewWechat">预览</el-button>
            <el-button
              type="primary"
              size="small"
              :loading="exporting"
              @click="exportWechat"
            >
              生成并复制
            </el-button>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="下载 Markdown">
        <div class="export-section">
          <p :style="{ color: 'var(--text-muted)', fontSize: '13px' }">
            将所有消息下载为 .md 文件。
          </p>
          <div class="form-actions">
            <el-button size="small" text :loading="previewing" @click="previewMarkdown">预览</el-button>
            <el-button size="small" @click="downloadMd">
              下载 .md
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <div v-if="previewContent" class="preview-panel" :style="{ borderColor: 'var(--border)', background: 'var(--surface)' }">
      <div class="preview-header" :style="{ borderColor: 'var(--border)' }">
        <span class="preview-label">预览</span>
        <span class="preview-format-tag">{{ previewFormat === 'blog' ? 'Hexo 草稿' : previewFormat === 'wechat' ? '公众号 HTML' : 'Markdown' }}</span>
        <el-button text size="small" @click="previewContent = ''">收起</el-button>
      </div>
      <div class="preview-body" :style="{ borderColor: 'var(--border)' }">
        <iframe
          v-if="previewFormat === 'wechat'"
          class="preview-iframe"
          :srcdoc="previewContent"
          sandbox="allow-scripts"
        />
        <pre v-else class="preview-code" :style="{ color: 'var(--text)', background: 'var(--bg)' }">{{ previewContent }}</pre>
      </div>
    </div>

    <div v-if="exportResult" class="result" :style="{ color: 'var(--accent)', borderColor: 'var(--border)' }">
      {{ exportResult }}
    </div>

    <template #footer>
      <el-button @click="$emit('close')">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.export-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-label {
  font-size: 13px;
  color: var(--text-muted);
  min-width: 64px;
}

.export-section {
  padding: 8px 0;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-panel {
  margin-top: 12px;
  border: 1px solid;
  border-radius: 8px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid;
  font-size: 12px;
}

.preview-label {
  font-weight: 600;
  color: var(--text);
}

.preview-format-tag {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--accent);
  background: var(--accent-soft);
}

.preview-body {
  max-height: 360px;
  overflow: auto;
}

.preview-code {
  margin: 0;
  padding: 12px;
  font-size: 12px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  border: none;
  border-radius: 0;
}

.preview-iframe {
  width: 100%;
  height: 340px;
  border: none;
}

.result {
  margin-top: 12px;
  padding: 8px 12px;
  border: 1px solid;
  border-radius: 6px;
  font-size: 13px;
}

@media (max-width: 767px) {
  .form-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .form-label {
    min-width: auto;
  }
}
</style>
