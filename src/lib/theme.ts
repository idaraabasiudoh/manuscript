import { useEffect, useState } from 'react'

// Light/dark theme. The app starts in light mode until the viewer picks dark with the toggle;
// the choice is saved per browser and applied as <html data-theme> (see the inline script in index.html,
// which sets it before first paint so there's no flash). data-theme is always set, so the device's
// dark-mode setting never takes over.

export type Theme = 'light' | 'dark'

const KEY = 'manuscript:theme'
const EVENT = 'manuscript:theme-change'

function saved(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function currentTheme(): Theme {
  return saved() ?? 'light'
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', theme === 'dark' ? '#131314' : '#ffffff')
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        const t = currentTheme()
        apply(t)
        setTheme(t)
      }
    }
    // Other toggles on this page (sidebar, home, full screen) stay in sync.
    const onLocal = () => setTheme(currentTheme())
    window.addEventListener('storage', onStorage)
    window.addEventListener(EVENT, onLocal)
    return () => {
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
