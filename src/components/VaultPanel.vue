<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useVaultStore } from '@/stores/vault'
import type { VaultInfo } from '@/types'

const vault = useVaultStore()
const collapsed = ref(false)
const expandedScans = ref<Set<number>>(new Set())

const phaseLabels: Record<string, string> = {
  scanning: '正在扫描文件…',
  reading: '正在读取内容…',
  building: '正在构建索引…',
  saving: '正在保存…',
}

function phaseLabel(phase: string): string {
  return phaseLabels[phase] || '处理中…'
}

function indexPercent(): number {
  const p = vault.indexProgress
  if (p.total <= 0) return 0
  return Math.round((p.current / p.total) * 100)
}

const typeMeta: Record<string, { label: string; desc: string }> = {
  study: { label: '学习', desc: '学习资料、课程笔记、技术文档' },
  life: { label: '生活', desc: '日常记录、个人思考、生活感悟' },
  blog: { label: '博客', desc: '已发布或待发布的博客内容' },
}

const form = reactive({
  vaults: [] as VaultInfo[],
})

function initForm() {
  form.vaults = vault.vaults.map(v => ({ ...v }))
  if (form.vaults.length < 3) {
    const types: Array<'study' | 'life' | 'blog'> = ['study', 'life', 'blog']
    for (let i = form.vaults.length; i < 3; i++) {
      form.vaults.push({
        name: ['学习笔记', '生活随笔', '博客文章'][i],
        path: '',
        type: types[i],
      })
    }
  }
}

async function save() {
  try {
    await vault.save({ vaults: form.vaults.filter(v => v.path) })
    ElMessage.success('知识库配置已保存')
  } catch {
    ElMessage.error('保存失败')
  }
}

async function scanAt(index: number) {
  try {
    const result = await vault.scan(index)
    ElMessage.success(`扫描完成，找到 ${result.count} 个文件`)
    expandedScans.value.add(index)
  } catch {
    ElMessage.error('扫描失败，请检查路径是否正确')
  }
}

async function indexAt(index: number) {
  try {
    const result = await vault.indexVault(index)
    ElMessage.success(`索引完成，共 ${result.fragments} 个片段（${result.elapsed}ms）`)
  } catch {
    ElMessage.error('索引失败，请先扫描知识库')
  }
}

function relativePath(absPath: string, vaultPath: string): string {
  if (absPath.startsWith(vaultPath)) {
    return absPath.slice(vaultPath.length).replace(/^\//, '')
  }
  return absPath
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function toggleScan(index: number) {
  const s = new Set(expandedScans.value)
  if (s.has(index)) s.delete(index)
  else s.add(index)
  expandedScans.value = s
}

initForm()
</script>

<template>
  <div class="vault-panel">
    <div class="panel-header" :style="{ borderColor: 'var(--border)' }" @click="collapsed = !collapsed">
      <span class="panel-title" :style="{ color: 'var(--text)' }">
        <span class="collapse-arrow" :class="{ collapsed }">▾</span>
        知识库
      </span>
      <el-button v-if="!collapsed" text size="small" @click.stop="save">保存</el-button>
    </div>

    <div class="vault-list" :class="{ collapsed }">
      <div
        v-for="(v, i) in form.vaults"
        :key="i"
        class="vault-card"
        :style="{
          borderColor: 'var(--border)',
          background: 'var(--surface)',
        }"
      >
        <div
          class="card-type-header"
          :style="{
            background: v.type === 'study' ? 'var(--vault-study-bg)' :
                        v.type === 'life' ? 'var(--vault-life-bg)' :
                        'var(--vault-blog-bg)',
            borderColor: v.type === 'study' ? 'var(--vault-study)' :
                         v.type === 'life' ? 'var(--vault-life)' :
                         'var(--vault-blog)',
          }"
        >
          <span
            class="card-type-dot"
            :style="{ background: v.type === 'study' ? 'var(--vault-study)' :
                                      v.type === 'life' ? 'var(--vault-life)' :
                                      'var(--vault-blog)' }"
          />
          <span
            class="card-type-label"
            :style="{ color: v.type === 'study' ? 'var(--vault-study)' :
                                    v.type === 'life' ? 'var(--vault-life)' :
                                    'var(--vault-blog)' }"
          >
            {{ typeMeta[v.type || 'study']?.label || '未知' }}
          </span>
        </div>

        <p class="card-type-desc" :style="{ color: 'var(--text-muted)' }">
          {{ typeMeta[v.type || 'study']?.desc || '' }}
        </p>

        <div class="card-path-row">
          <el-input
            v-model="v.path"
            size="small"
            :placeholder="`${typeMeta[v.type || 'study']?.label || ''} vault 路径`"
          />
        </div>

        <div class="card-actions">
          <el-button
            size="small"
            text
            :loading="vault.scanning === i"
            @click="scanAt(i)"
          >
            {{ vault.scanning === i ? '扫描中…' : '扫描' }}
          </el-button>
          <el-button
            size="small"
            text
            :loading="vault.indexing === i"
            :disabled="!vault.scanResults.has(i)"
            @click="indexAt(i)"
          >
            {{ vault.indexing === i ? '索引中…' : '索引' }}
          </el-button>
        </div>

        <!-- Index progress bar -->
        <div
          v-if="vault.indexing === i"
          class="index-progress"
        >
          <div class="index-phase-row">
            <span class="index-phase-label" :style="{ color: 'var(--text-muted)' }">
              {{ phaseLabel(vault.indexPhase) }}
            </span>
            <span
              v-if="vault.indexPhase === 'reading' && vault.indexProgress.total > 0"
              class="index-phase-count"
              :style="{ color: 'var(--text-muted)' }"
            >
              {{ vault.indexProgress.current }} / {{ vault.indexProgress.total }}
            </span>
          </div>
          <div class="index-bar-track" :style="{ background: 'var(--border)' }">
            <div
              class="index-bar-fill"
              :class="{ indeterminate: vault.indexPhase !== 'reading' || vault.indexProgress.total <= 0 }"
              :style="{
                background: 'var(--accent)',
                width: vault.indexPhase === 'reading' && vault.indexProgress.total > 0 ? indexPercent() + '%' : '',
              }"
            />
          </div>
        </div>

        <div
          v-if="vault.scanResults.has(i)"
          class="scan-results"
        >
          <div
            class="scan-toggle"
            :style="{ color: 'var(--text-muted)' }"
            @click="toggleScan(i)"
          >
            <span class="scan-arrow" :class="{ expanded: expandedScans.has(i) }">▸</span>
            {{ vault.scanResults.get(i)?.length || 0 }} 个 .md 文件
          </div>

          <div v-if="expandedScans.has(i)" class="scan-file-list">
            <div
              v-for="f in vault.scanResults.get(i)"
              :key="f.path"
              class="scan-file-item"
              :style="{ borderColor: 'var(--border)' }"
            >
              <span class="scan-file-name" :style="{ color: 'var(--text)' }">{{ f.name }}</span>
              <span class="scan-file-meta" :style="{ color: 'var(--text-muted)' }">
                {{ relativePath(f.path, v.path) }} — {{ formatSize(f.size) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vault-panel {
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid;
  cursor: pointer;
  user-select: none;
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

.collapse-arrow {
  display: inline-block;
  font-size: 10px;
  transition: transform 0.2s ease;
}

.collapse-arrow.collapsed {
  transform: rotate(-90deg);
}

.vault-list {
  padding: 8px;
  max-height: 600px;
  overflow-y: auto;
  transition: max-height 0.25s ease, padding 0.25s ease;
}

.vault-list.collapsed {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  overflow: hidden;
}

.vault-card {
  border: 1px solid;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
}

.vault-card:last-child {
  margin-bottom: 0;
}

.card-type-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 12px;
  border: 1px solid;
  width: fit-content;
  margin-bottom: 6px;
}

.card-type-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.card-type-label {
  font-size: 11px;
  font-weight: 600;
}

.card-type-desc {
  font-size: 11px;
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.card-path-row {
  margin-bottom: 6px;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.index-progress {
  margin-top: 6px;
}

.index-phase-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.index-phase-label {
  font-size: 11px;
}

.index-phase-count {
  font-size: 10px;
  font-family: monospace;
}

.index-bar-track {
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
}

.index-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.2s ease;
}

.index-bar-fill.indeterminate {
  width: 40% !important;
  animation: indexPulse 1.2s ease-in-out infinite;
}

@keyframes indexPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.scan-results {
  margin-top: 6px;
}

.scan-toggle {
  font-size: 11px;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

.scan-arrow {
  display: inline-block;
  font-size: 9px;
  transition: transform 0.15s ease;
}

.scan-arrow.expanded {
  transform: rotate(90deg);
}

.scan-file-list {
  margin-top: 4px;
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 0;
}

.scan-file-item {
  display: flex;
  flex-direction: column;
  padding: 3px 8px;
  border-bottom: 1px dashed;
}

.scan-file-item:last-child {
  border-bottom: none;
}

.scan-file-name {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.scan-file-meta {
  font-size: 10px;
  line-height: 1.3;
}
</style>
