import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Theme } from '@/types'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>('monet')

  const isDark = computed(() => theme.value === 'cyberpunk')

  function toggle() {
    theme.value = theme.value === 'monet' ? 'cyberpunk' : 'monet'
    document.documentElement.classList.toggle('cyberpunk', theme.value === 'cyberpunk')
  }

  function init() {
    document.documentElement.classList.toggle('cyberpunk', theme.value === 'cyberpunk')
  }

  return { theme, isDark, toggle, init }
})
