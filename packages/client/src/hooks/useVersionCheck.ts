import { useEffect, useState } from 'react'

declare const __APP_VERSION__: string
const VERSION_KEY = 'kototv_version'

type UpdateState = 'idle' | 'preparing' | 'ready'

export function useVersionCheck() {
  const [hasUpdate, setHasUpdate] = useState(false)
  const [state, setState] = useState<UpdateState>('idle')

  useEffect(() => {
    if (import.meta.env.DEV) return

    const check = async () => {
      try {
        const res = await fetch('/api/version')
        if (!res.ok) return
        const { version } = (await res.json()) as { version: string }
        const stored = localStorage.getItem(VERSION_KEY)
        if (!stored) {
          localStorage.setItem(VERSION_KEY, version)
          return
        }
        if (stored !== version) setHasUpdate(true)
      } catch {
        // Offline or API down — silent
      }
    }
    check()
  }, [])

  const prepare = async () => {
    setState('preparing')
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) await reg.update()
    }
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
    localStorage.removeItem(VERSION_KEY)
    await new Promise((r) => setTimeout(r, 2000))
    setState('ready')
  }

  const reload = () => window.location.reload()

  return { hasUpdate, state, prepare, reload }
}
