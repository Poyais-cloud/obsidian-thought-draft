import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { VaultInfo, VaultConfig, FileInfo } from '@/types'
import { api } from '@/api'

export const useVaultStore = defineStore('vault', () => {
  const vaults = ref<VaultInfo[]>([])
  const loading = ref(false)
  const scanning = ref<number | null>(null)
  const indexing = ref<number | null>(null)
  const scanResults = ref<Map<number, FileInfo[]>>(new Map())

  // Index progress
  const indexPhase = ref('')
  const indexProgress = ref({ current: 0, total: 0 })

  const vaultFilters = ref<{ key: string; label: string }[]>([])

  function updateFilters() {
    vaultFilters.value = [
      { key: '', label: '全部' },
      ...vaults.value
        .filter(v => v.path)
        .map(v => ({
          key: v.path,
          label: v.type === 'study' ? '学习' : v.type === 'life' ? '生活' : v.type === 'blog' ? '博客' : v.name,
        })),
    ]
  }

  async function load() {
    try {
      const data = await api.getVaults()
      vaults.value = data.vaults
      updateFilters()
    } catch {}
  }

  async function save(config: VaultConfig) {
    await api.saveVaults(config)
    vaults.value = config.vaults
    updateFilters()
  }

  async function scan(index: number) {
    scanning.value = index
    try {
      const result = await api.scanVault(index)
      scanResults.value.set(index, result.files)
      return result
    } finally {
      scanning.value = null
    }
  }

  async function indexVault(index: number) {
    indexing.value = index
    indexPhase.value = ''
    indexProgress.value = { current: 0, total: 0 }
    try {
      const result = await api.indexVaultStream(index, (phase, detail) => {
        indexPhase.value = phase
        if (detail) indexProgress.value = { current: detail.current || 0, total: detail.total || 0 }
      })
      return result
    } finally {
      indexing.value = null
      indexPhase.value = ''
    }
  }

  return {
    vaults, loading, scanning, indexing, scanResults,
    indexPhase, indexProgress,
    vaultFilters, load, save, scan, indexVault, updateFilters,
  }
})
