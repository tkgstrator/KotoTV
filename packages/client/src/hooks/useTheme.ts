import { useCallback, useEffect, useState } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'kototv-theme'

function readStorage(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // SSR / private browsing
  }
  return 'system'
}

function resolveTheme(theme: ThemeChoice): ResolvedTheme {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>(readStorage)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStorage()))

  useEffect(() => {
    const r = resolveTheme(theme)
    setResolved(r)
    applyTheme(r)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    function handleChange() {
      const r = resolveTheme('system')
      setResolved(r)
      applyTheme(r)
    }
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = useCallback((next: ThemeChoice) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // private browsing
    }
    setThemeState(next)
  }, [])

  return { theme, resolved, setTheme }
}
