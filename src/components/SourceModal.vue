<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SearchResult, ClientSource } from '@/types'

const props = defineProps<{
  results: SearchResult[]
  query?: string
}>()

const emit = defineEmits<{
  confirm: [sources: ClientSource[]]
  close: []
}>()

interface TextSegment {
  text: string
  highlight: boolean
}

function buildHighlightSegments(snippet: string, query: string): TextSegment[] {
  const terms = query.trim().split(/\s+/).filter(t => t.length > 0)
  if (terms.length === 0) return [{ text: snippet, highlight: false }]

  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')

  const segments: TextSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(snippet)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: snippet.slice(lastIndex, match.index), highlight: false })
    }
    segments.push({ text: match[0], highlight: true })
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < snippet.length) {
    segments.push({ text: snippet.slice(lastIndex), highlight: false })
  }

  return segments.length > 0 ? segments : [{ text: snippet, highlight: false }]
}

const selected = ref<Set<number>>(new Set(props.results.map((_, i) => i)))
const filterText = ref('')

const filtered = computed(() => {
  if (!filterText.value) return props.results
  const q = filterText.value.toLowerCase()
  return props.results.filter(r =>
    r.sourceName.toLowerCase().includes(q) || r.snippet.toLowerCase().includes(q)
  )
})

const queryTerms = computed(() => props.query?.trim() || '')

function toggle(i: number) {
  const s = new Set(selected.value)
  if (s.has(i)) s.delete(i)
  else s.add(i)
  selected.value = s
}

function selectAll() {
  selected.value = new Set(filtered.value.map(r => {
    const globalIdx = props.results.indexOf(r)
    return globalIdx
  }))
}

function deselectAll() {
  selected.value = new Set()
}

function confirm() {
  const sources: ClientSource[] = []
  for (const i of selected.value) {
    const r = props.results[i]
    if (r) {
      sources.push({
        sourceName: r.sourceName,
        sourcePath: r.sourcePath,
        snippet: r.snippet,
        score: r.score,
      })
    }
  }
  emit('confirm', sources)
}
</script>

<template>
  <el-dialog
    title="来源确认 — 选择 AI 参考的笔记"
    :model-value="true"
    class="source-dialog"
    width="min(640px, 92vw)"
    top="3vh"
    @close="$emit('close')"
  >
    <template #header>
      <div class="source-header">
        <span style="font-weight: 600; font-size: 15px;">来源确认 — 选择 AI 参考的笔记</span>
        <el-input
          v-model="filterText"
          size="small"
          placeholder="搜索过滤..."
          style="width: 200px; margin-left: auto;"
          clearable
        />
      </div>
    </template>

    <div class="source-actions">
      <el-button text size="small" @click="selectAll">全选</el-button>
      <el-button text size="small" @click="deselectAll">取消全选</el-button>
      <span class="count" :style="{ color: 'var(--text-muted)' }">
        已选 {{ selected.size }} / {{ results.length }} 条
      </span>
    </div>

    <div class="source-list">
      <div
        v-for="(r, i) in filtered"
        :key="i"
        class="source-item"
        :class="{ selected: selected.has(props.results.indexOf(r)) }"
        :style="{
          borderColor: 'var(--border)',
          background: selected.has(props.results.indexOf(r)) ? 'var(--accent-warm-soft)' : 'var(--surface)',
        }"
        @click="toggle(props.results.indexOf(r))"
      >
        <button
          type="button"
          class="source-check"
          :class="{ checked: selected.has(props.results.indexOf(r)) }"
          :aria-pressed="selected.has(props.results.indexOf(r))"
          @click.stop="toggle(props.results.indexOf(r))"
        >
          <span v-if="selected.has(props.results.indexOf(r))">✓</span>
        </button>
        <div class="source-info">
          <div class="source-name" :style="{ color: 'var(--text)' }">
            {{ r.sourceName }}
            <span class="score" :style="{ color: 'var(--accent-warm)' }">
              {{ r.score.toFixed(2) }}
            </span>
          </div>
          <div class="source-snippet" :style="{ color: 'var(--text-muted)' }">
            <template v-for="(seg, si) in buildHighlightSegments(r.snippet.slice(0, 200), queryTerms)" :key="si">
              <mark v-if="seg.highlight" class="query-highlight">{{ seg.text }}</mark>
              <span v-else>{{ seg.text }}</span>
            </template>
            <span v-if="r.snippet.length > 200">...</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="modal-btn secondary" @click="$emit('close')">取消</button>
      <button type="button" class="modal-btn primary" @click="confirm" :disabled="selected.size === 0">
        确认 ({{ selected.size }} 条)
      </button>
    </template>
  </el-dialog>
</template>

<style scoped>
:deep(.source-dialog) {
  --el-color-primary: var(--accent-warm);
  --el-border-radius-small: 6px;
}

:deep(.source-dialog .el-dialog) {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 18px 50px rgba(63, 57, 48, 0.16);
}

:deep(.source-dialog .el-dialog__header) {
  padding: 18px 22px 10px;
}

:deep(.source-dialog .el-dialog__body) {
  padding: 12px 22px 18px;
}

:deep(.source-dialog .el-dialog__footer) {
  padding: 14px 22px 20px;
}

:deep(.source-dialog .el-input__wrapper) {
  background: var(--surface);
  border-radius: 8px;
  box-shadow: 0 0 0 1px var(--border) inset;
}

:deep(.source-dialog .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--accent-warm) inset;
}

:deep(.source-dialog .el-button.is-text) {
  color: var(--text);
  font-weight: 600;
}

:deep(.source-dialog .el-button.is-text:hover) {
  color: var(--accent-warm);
  background: var(--accent-warm-soft);
}

.source-header {
  display: flex;
  align-items: center;
  width: 100%;
}

.source-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.count {
  font-size: 12px;
  margin-left: auto;
}

.source-list {
  max-height: 50vh;
  overflow-y: auto;
}

.source-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  margin-bottom: 8px;
  border: 1px solid;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.source-item.selected {
  border-color: color-mix(in srgb, var(--accent-warm) 38%, var(--border));
}

.source-item:hover {
  border-color: color-mix(in srgb, var(--accent-warm) 34%, var(--border));
  box-shadow: 0 2px 10px rgba(94, 79, 63, 0.06);
}

.source-check {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  margin-top: 3px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  color: var(--surface);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.source-check.checked {
  background: var(--accent-warm);
  border-color: var(--accent-warm);
  color: #fff;
}

.source-info {
  flex: 1;
  min-width: 0;
}

.source-name {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
}

.score {
  font-size: 11px;
  margin-left: 8px;
}

.source-snippet {
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.query-highlight {
  background: color-mix(in srgb, var(--accent-warm) 18%, var(--surface));
  color: var(--accent-warm);
  border-radius: 2px;
  padding: 0 1px;
}

.modal-btn {
  min-width: 72px;
  height: 34px;
  padding: 0 14px;
  border-radius: 7px;
  border: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.modal-btn.secondary {
  background: var(--surface);
  color: var(--text);
}

.modal-btn.secondary:hover {
  background: var(--bg);
  border-color: color-mix(in srgb, var(--accent-warm) 28%, var(--border));
}

.modal-btn.primary {
  background: var(--accent-warm);
  border-color: var(--accent-warm);
  color: #fff;
}

.modal-btn.primary:hover:not(:disabled) {
  filter: brightness(0.96);
}

.modal-btn:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

@media (max-width: 767px) {
  .source-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
  }

  .source-header :deep(.el-input) {
    width: 100% !important;
    margin-left: 0 !important;
  }

  .source-actions {
    flex-wrap: wrap;
    gap: 4px;
  }

  .count {
    margin-left: 0;
  }
}
</style>
