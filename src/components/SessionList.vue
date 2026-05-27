<script setup lang="ts">
import { useSessionStore } from '@/stores/session'
import { useChatStore } from '@/stores/chat'

const session = useSessionStore()
const chat = useChatStore()

const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <div class="session-list">
    <div
      v-for="s in session.sessions"
      :key="s.id"
      class="session-item"
      :class="{ current: s.id === chat.sessionId }"
      :style="{
        background: s.id === chat.sessionId ? 'var(--accent-soft)' : 'transparent',
        color: s.id === chat.sessionId ? 'var(--accent)' : 'var(--text)',
      }"
      @click="$emit('select', s.id)"
    >
      <span class="session-title">{{ s.title }}</span>
      <el-button
        text
        size="small"
        class="del-btn"
        @click.stop="session.remove(s.id); if (chat.sessionId === s.id) chat.newSession()"
      >
        <span style="font-size: 10px">x</span>
      </el-button>
    </div>
    <div v-if="session.sessions.length === 0" class="empty" :style="{ color: 'var(--text-muted)' }">
      暂无会话
    </div>
  </div>
</template>

<style scoped>
.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  margin-bottom: 2px;
  transition: background 0.15s;
}

.session-item:hover {
  opacity: 0.85;
}

.session-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.del-btn {
  opacity: 0;
  margin-left: 6px;
}

.session-item:hover .del-btn {
  opacity: 1;
}

.empty {
  text-align: center;
  padding: 20px;
  font-size: 12px;
}
</style>
