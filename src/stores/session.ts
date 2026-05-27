import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SessionItem } from '@/types'
import { api } from '@/api'

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<SessionItem[]>([])

  async function load() {
    try {
      const data = await api.getSessions()
      if (Array.isArray(data)) sessions.value = data
    } catch {}
  }

  async function remove(id: string) {
    await api.deleteSession(id)
    await load()
  }

  return { sessions, load, remove }
})
