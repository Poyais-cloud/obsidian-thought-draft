<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useVaultStore } from '@/stores/vault'
import { useSessionStore } from '@/stores/session'
import { useThemeStore } from '@/stores/theme'
import ChatPanel from '@/components/ChatPanel.vue'
import VaultPanel from '@/components/VaultPanel.vue'
import SessionList from '@/components/SessionList.vue'
import type { Mode } from '@/types'
import { MODES, MODE_LABELS } from '@/types'

const chat = useChatStore()
const vault = useVaultStore()
const session = useSessionStore()
const theme = useThemeStore()

const modes: { id: Mode; label: string; hint: string }[] = [
  { id: 'brainstorm', label: '头脑风暴', hint: '提问引导思考，发现想法之间的关联' },
  { id: 'writing', label: '写作助手', hint: '基于你的笔记素材，生成完整文章' },
  { id: 'connect', label: '连接发现', hint: '输入关键词，搜索笔记并生成双链建议' },
]

const currentHint = () => modes.find(m => m.id === chat.mode)?.hint || ''
const runningModes = computed(() => MODES.filter(m => chat.activeRunState(m) === 'running'))

function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const sid = params.get('session')
  if (sid) {
    chat.switchSession(sid)
  }
}

onMounted(() => {
  theme.init()
  session.load()
  vault.load()
  restoreFromUrl()
})

function modeKey(mode: Mode, sessionId: string) {
  return `${sessionId}-${mode}`
}

function onSessionSelect(id: string) {
  chat.switchSession(id)
  if (window.innerWidth < 768) chat.sidebarOpen = false
}

function onNewSession() {
  chat.newSession()
  session.load()
  if (window.innerWidth < 768) chat.sidebarOpen = false
}
</script>

<template>
  <div class="app-shell" :style="{ background: 'var(--bg)' }">
    <header class="app-header" :style="{ background: 'var(--surface)', borderColor: 'var(--border)' }">
      <div class="header-left">
        <el-button
          text
          size="small"
          @click="chat.sidebarOpen = !chat.sidebarOpen"
          :title="chat.sidebarOpen ? '收起侧栏' : '展开侧栏'"
        >
          {{ chat.sidebarOpen ? '◁' : '▷' }}
        </el-button>
        <span class="app-title" :style="{ color: 'var(--text)' }">Thought Draft</span>
        <span
          v-if="runningModes.length > 0"
          class="gen-indicator"
          :style="{ color: 'var(--accent)' }"
        >
          {{ runningModes.map(m => MODE_LABELS[m]).join(' / ') }} 生成中
        </span>
      </div>

      <div class="mode-switcher" :style="{ background: 'var(--bg)', border: '1px solid var(--border)' }">
        <button
          v-for="m in modes"
          :key="m.id"
          class="mode-btn"
          :class="{ active: chat.mode === m.id }"
          :style="chat.mode === m.id
            ? { background: 'var(--accent)', color: '#fff' }
            : { color: 'var(--text-muted)' }"
          @click="chat.setMode(m.id)"
        >
          {{ m.label }}
          <span
            v-if="chat.activeRunState(m.id) === 'running'"
            class="mode-dot"
            :style="{ background: chat.mode === m.id ? '#fff' : 'var(--accent)' }"
          />
        </button>
      </div>

      <el-button text size="small" @click="theme.toggle()">
        {{ theme.theme === 'monet' ? 'Monet' : 'Noir' }}
      </el-button>
    </header>

    <div class="sub-header" :style="{ background: 'var(--surface)', borderColor: 'var(--border)' }">
      <span class="mode-hint" :style="{ color: 'var(--text-muted)' }">{{ currentHint() }}</span>
      <div class="vault-filters">
        <button
          v-for="v in vault.vaultFilters"
          :key="v.key"
          class="filter-btn"
          :class="{ active: chat.vault === v.key }"
          :style="chat.vault === v.key
            ? { background: 'var(--accent)', color: '#fff' }
            : { color: 'var(--text-muted)' }"
          @click="chat.setVault(v.key)"
        >
          {{ v.label }}
        </button>
      </div>
    </div>

    <div class="main-content">
      <div
        class="sidebar-backdrop"
        :class="{ show: chat.sidebarOpen }"
        @click="chat.sidebarOpen = false"
      />

      <aside
        class="sidebar"
        :class="{ open: chat.sidebarOpen }"
        :style="{ background: 'var(--surface)', borderColor: 'var(--border)' }"
      >
        <div class="sidebar-new-btn" :style="{ borderColor: 'var(--border)' }">
          <el-button
            size="small"
            style="width: 100%"
            @click="onNewSession()"
          >
            + 新会话
          </el-button>
        </div>
        <SessionList @select="onSessionSelect" />
        <VaultPanel />
      </aside>

      <main class="chat-area">
        <ChatPanel :key="modeKey(chat.mode, chat.sessionId)" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.app-title {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: -0.02em;
}

.gen-indicator {
  font-size: 11px;
  font-weight: 500;
}

.mode-switcher {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 20px;
}

.mode-btn {
  border: none;
  background: transparent;
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.mode-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  animation: pulse 0.8s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.sub-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 16px;
  border-bottom: 1px solid;
  flex-shrink: 0;
}

.mode-hint {
  font-size: 12px;
}

.vault-filters {
  display: flex;
  gap: 2px;
}

.filter-btn {
  border: none;
  background: transparent;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.15s;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 280px;
  border-right: 1px solid;
  display: none;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar.open {
  display: flex;
}

@media (min-width: 768px) {
  .sidebar.open {
    display: flex;
  }
}

.sidebar-new-btn {
  padding: 10px;
  border-bottom: 1px solid;
}

.chat-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-backdrop {
  display: none;
}

@media (max-width: 767px) {
  .app-header {
    gap: 6px;
    padding: 6px 10px;
  }

  .header-left {
    gap: 4px;
  }

  .app-title {
    font-size: 13px;
  }

  .gen-indicator {
    display: none;
  }

  .mode-switcher {
    gap: 1px;
  }

  .mode-btn {
    font-size: 10px;
    padding: 3px 7px;
  }

  .sub-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 6px 10px;
  }

  .mode-hint {
    font-size: 11px;
  }

  .vault-filters {
    width: 100%;
    overflow-x: auto;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 1000;
    width: 280px;
    max-width: 85vw;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    display: flex !important;
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 999;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
  }

  .sidebar-backdrop.show {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
