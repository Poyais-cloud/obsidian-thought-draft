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

export type Mode = 'brainstorm' | 'writing' | 'connect'
