import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Message, ClientMessage, ClientSource, Mode, SearchResult, RunState } from '@/types'
import { MODES } from '@/types'
import { api } from '@/api'

function makeId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

function makeSharedUserId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

function toObsidianUri(sourcePath: string): string {
  const parts = sourcePath.split('/')
  const userIdx = parts.indexOf('Users')
  if (userIdx < 0) return `file://${sourcePath}`
  const vaultName = parts[userIdx + 2]
  const relPath = parts.slice(userIdx + 3).join('/')
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relPath)}`
}

interface SessionSearchState {
  lastQuery: string
  searchResults: SearchResult[]
  selectedSources: ClientSource[]
}

export const useChatStore = defineStore('chat', () => {
  const mode = ref<Mode>('brainstorm')
  const vault = ref('')
  const sessionId = ref(makeId())
  const streaming = ref(false)
  const searching = ref(false)
  const error = ref('')
  const searchResults = ref<SearchResult[]>([])
  const selectedSources = ref<ClientSource[]>([])
  const showSourceModal = ref(false)
  const sidebarOpen = ref(true)
  const lastQuery = ref('')

  // Per-mode state
  const messagesByMode = ref<Record<Mode, Message[]>>({
    brainstorm: [], writing: [], connect: [],
  })
  const runStateByMode = ref<Record<Mode, RunState>>({
    brainstorm: 'idle', writing: 'idle', connect: 'idle',
  })
  const controllersByMode: Partial<Record<Mode, AbortController>> = {}

  const sessionSearchCache: Record<string, SessionSearchState> = {}

  const currentMessages = computed(() => messagesByMode.value[mode.value])
  const anyLoading = computed(() => MODES.some(m => runStateByMode.value[m] === 'running'))

  function activeRunState(m: Mode): RunState {
    return runStateByMode.value[m]
  }

  function storageKey(m: Mode): string {
    return `otd_chat_${sessionId.value}_${m}`
  }

  function loadHistory(m: Mode): Message[] {
    try {
      const raw = localStorage.getItem(storageKey(m))
      if (!raw) return []
      return JSON.parse(raw) as Message[]
    } catch { return [] }
  }

  function saveHistory(m: Mode, msgs: Message[]) {
    try {
      const toSave = msgs.slice(-80).map(msg => ({
        ...msg,
        sourceDismissed: msg.sourceDismissed,
        sourceVisible: msg.sourceVisible,
      }))
      localStorage.setItem(storageKey(m), JSON.stringify(toSave))
    } catch {}
  }

  // source utils
  function noteBase(name: string): string {
    return name.replace(/\.md$/i, '').trim()
  }

  function findSourceByName(sources: SearchResult[] | undefined, name: string): SearchResult | undefined {
    if (!sources?.length) return undefined
    const target = noteBase(name)
    return (
      sources.find(s => noteBase(s.sourceName) === target) ||
      sources.find(s => noteBase(s.sourceName).includes(target) || target.includes(noteBase(s.sourceName)))
    )
  }

  function saveCurrentSearchState() {
    if (searchResults.value.length > 0 || lastQuery.value) {
      sessionSearchCache[sessionId.value] = {
        lastQuery: lastQuery.value,
        searchResults: [...searchResults.value],
        selectedSources: [...selectedSources.value],
      }
    }
  }

  function restoreSearchState(id: string) {
    const cached = sessionSearchCache[id]
    if (cached) {
      lastQuery.value = cached.lastQuery
      searchResults.value = cached.searchResults
      selectedSources.value = cached.selectedSources
    } else {
      lastQuery.value = ''
      searchResults.value = []
      selectedSources.value = []
    }
  }

  function setMode(m: Mode) {
    mode.value = m
  }

  function setVault(v: string) {
    vault.value = v
  }

  function newSession() {
    saveCurrentSearchState()
    for (const m of MODES) {
      saveHistory(m, messagesByMode.value[m])
    }
    sessionId.value = makeId()
    for (const m of MODES) {
      messagesByMode.value[m] = []
      runStateByMode.value[m] = 'idle'
    }
    lastQuery.value = ''
    searchResults.value = []
    selectedSources.value = []
    showSourceModal.value = false
    error.value = ''
    window.history.pushState({}, '', `/?session=${sessionId.value}`)
  }

  function switchSession(id: string) {
    saveCurrentSearchState()
    for (const m of MODES) {
      saveHistory(m, messagesByMode.value[m])
    }
    sessionId.value = id
    for (const m of MODES) {
      messagesByMode.value[m] = loadHistory(m)
      runStateByMode.value[m] = 'idle'
    }
    showSourceModal.value = false
    window.history.pushState({}, '', `/?session=${id}`)
    // Try API load
    for (const m of MODES) {
      loadSessionFromApi(id, m)
    }
    restoreSearchState(id)
  }

  async function loadSessionFromApi(id: string, m: Mode) {
    try {
      const session = await api.getSession(id, m)
      if (session && Array.isArray(session.messages) && session.messages.length > 0) {
        const msgs: Message[] = session.messages.map(msg => ({
          id: makeId(),
          role: msg.role,
          content: msg.content,
        }))
        messagesByMode.value[m] = msgs
      }
    } catch {}
  }

  async function search(query: string): Promise<SearchResult[]> {
    searching.value = true
    try {
      const res = await api.search(query, vault.value || undefined)
      searchResults.value = res.results
      return res.results
    } catch {
      return []
    } finally {
      searching.value = false
    }
  }

  function confirmSources(sources: ClientSource[]) {
    selectedSources.value = sources
    showSourceModal.value = false
  }

  // Run a single mode stream
  async function runModeStream(
    targetMode: Mode,
    userMsg: Message,
    initialMessages: Message[],
    selectedSources: ClientSource[],
  ) {
    const controller = new AbortController()
    controllersByMode[targetMode] = controller

    runStateByMode.value[targetMode] = 'running'
    const assistantMsg: Message = {
      id: makeId(),
      role: 'assistant',
      content: '',
      sources: selectedSources.map(s => ({ ...s, score: s.score || 0 })),
      sourceVisible: Math.min(15, selectedSources.length),
      sourceDismissed: [],
    }
    messagesByMode.value[targetMode] = [...initialMessages, userMsg, assistantMsg]

    const msgsForApi: ClientMessage[] = [...initialMessages, { role: userMsg.role, content: userMsg.content }]
      .filter(m => m.content.trim())

    try {
      const res = await api.chatStream({
        messages: msgsForApi,
        mode: targetMode,
        vault: vault.value || undefined,
        switched: initialMessages.length === 0,
        sources: selectedSources,
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(errBody.error || `请求失败 (${res.status})`)
      }

      if (!res.body) throw new Error('响应为空')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'text-delta') {
                const msgs = messagesByMode.value[targetMode]
                const last = msgs[msgs.length - 1]
                if (last && last.role === 'assistant') {
                  last.content += parsed.textDelta
                }
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error || 'AI 服务错误')
              }
            } catch (e) {
              if (e instanceof Error && e.message !== 'AI 服务错误') {
                // raw text chunk
                if (data && !data.startsWith('{')) {
                  const msgs = messagesByMode.value[targetMode]
                  const last = msgs[msgs.length - 1]
                  if (last && last.role === 'assistant') {
                    last.content += data
                  }
                }
              } else if (e instanceof Error) {
                throw e
              }
            }
          }
        }
      }

      runStateByMode.value[targetMode] = 'done'

      // Save to API
      const finalMsgs = messagesByMode.value[targetMode]
      try {
        await api.saveSession({
          id: sessionId.value,
          title: userMsg.content.slice(0, 50),
          mode: targetMode,
          messages: finalMsgs.filter(m => m.content).map(m => ({
            role: m.role,
            content: m.content,
          })),
        })
      } catch {}
      saveHistory(targetMode, finalMsgs)
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        const msg = err instanceof Error ? err.message : '未知错误'
        const msgs = messagesByMode.value[targetMode]
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant' && !last.content) {
          last.content = `**错误：${msg}**`
        }
        runStateByMode.value[targetMode] = 'error'
      } else {
        runStateByMode.value[targetMode] = 'idle'
      }
    } finally {
      delete controllersByMode[targetMode]
    }
  }

  // Run all 3 modes in parallel
  function runAllModes(
    question: string,
    currentModeMessages: Message[],
    selectedSources: ClientSource[],
  ) {
    const sharedId = makeSharedUserId()

    for (const targetMode of MODES) {
      const initialMessages = targetMode === mode.value
        ? currentModeMessages
        : messagesByMode.value[targetMode]

      const userMsg: Message = {
        id: `${sharedId}-${targetMode}`,
        role: 'user',
        content: question,
      }
      void runModeStream(targetMode, userMsg, initialMessages, selectedSources)
    }
  }

  // Abort all running modes
  function abortAll() {
    for (const controller of Object.values(controllersByMode)) {
      controller?.abort()
    }
  }

  // Dismiss a source from a message
  function dismissSource(msgId: string, idx: number) {
    const msgs = messagesByMode.value[mode.value]
    const msg = msgs.find(m => m.id === msgId)
    if (!msg?.sources) return
    if (!msg.sourceDismissed) msg.sourceDismissed = []
    if (!msg.sourceDismissed.includes(idx)) {
      msg.sourceDismissed.push(idx)
    }
    if (!msg.sourceVisible) msg.sourceVisible = Math.min(15, msg.sources.length)
    msg.sourceVisible = Math.min(msg.sourceVisible + 1, msg.sources.length)
  }

  return {
    mode, vault, sessionId, streaming, searching, error,
    searchResults, selectedSources, showSourceModal, sidebarOpen, lastQuery,
    messagesByMode, runStateByMode,
    currentMessages, anyLoading,
    setMode, setVault, newSession, switchSession,
    search, confirmSources, abortAll,
    runAllModes, runModeStream,
    activeRunState, dismissSource,
    findSourceByName, toObsidianUri,
  }
})
