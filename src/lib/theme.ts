import { useEffect, useState } from 'react'

// Light/dark theme. The app follows the device until the viewer picks one with the toggle;
// the choice is saved per browser and applied as <html data-theme> (see the inline script in index.html,
// which sets it before first paint so there's no flash).

export type Theme = 'light' | 'dark'

const KEY = 'manuscript:theme'
const EVENT = 'manuscript:theme-change'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function saved(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function currentTheme(): Theme {
  return saved() ?? (media().matches ? 'dark' : 'light')
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', theme === 'dark' ? '#131314' : '#ffffff')
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  // Keep following the device while the viewer hasn't chosen.
  useEffect(() => {
    const mq = media()
    const onChange = () => {
      if (!saved()) setTheme(mq.matches ? 'dark' : 'light')
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        const t = currentTheme()
        apply(t)
        setTheme(t)
      }
    }
    // Other toggles on this page (sidebar, home, full screen) stay in sync.
    const onLocal = () => setTheme(currentTheme())
    mq.addEventListener('change', onChange)
    window.addEventListener('storage', onStorage)
    window.addEventListener(EVENT, onLocal)
    return () => {
      mq.removeEventListener('change', onChange)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(EVENT, onLocal)
    }
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* storage unavailable: still switch for this visit */
    }
    apply(next)
    setTheme(next)
    window.dispatchEvent(new Event(EVENT))
  }

  return { theme, toggle }
}
