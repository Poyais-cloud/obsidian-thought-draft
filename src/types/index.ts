export interface VaultInfo {
  name: string
  path: string
  type?: 'study' | 'life' | 'blog'
}

export interface FileInfo {
  name: string
  path: string
  size: number
  updatedAt: number
}

export interface VaultConfig {
  vaults: VaultInfo[]
}

export interface ClientMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SearchResult[]
  sourceVisible?: number
  sourceDismissed?: number[]
}

export interface ClientSource {
  sourceName: string
  sourcePath: string
  snippet: string
  score?: number
}

export interface SearchResult {
  sourceName: string
  sourcePath: string
  snippet: string
  score: number
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  count: number
}

export interface SessionItem {
  id: string
  title: string
  updatedAt: string
  mode?: string
}

export interface Session {
  id: string
  title: string
  mode: string
  messages: ClientMessage[]
  updatedAt: string
}

export interface LinkSuggestion {
  fromName: string
  toName: string
  reason?: string
  from?: SearchResult
  to?: SearchResult
}

export type Mode = 'brainstorm' | 'writing' | 'connect'
export type Theme = 'monet' | 'cyberpunk'
export type RunState = 'idle' | 'running' | 'done' | 'error'

export const MODES: Mode[] = ['brainstorm', 'writing', 'connect']

export const MODE_LABELS: Record<Mode, string> = {
  brainstorm: '头脑风暴',
  writing: '写作助手',
  connect: '连接发现',
}

export interface ModeConfig {
  id: Mode
  label: string
  hint: string
}
