'use client'

import * as React from 'react'

export type Theme = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'rolefit-theme'
const DEFAULT_THEME: Theme = 'dark'

export type ThemeSnapshot = {
  /** The user's stored preference, which may be 'system'. */
  theme: Theme
  /** The theme actually painted right now — never 'system'. */
  resolvedTheme: 'dark' | 'light'
}

/* -------------------------------------------------------------------------
   Theme is an external store, not React state.

   The source of truth lives in localStorage and on <html>, and ThemeScript
   writes to it before React exists. Modelling that as useState forces a
   read-then-setState in an effect, which cascades an extra render on every
   mount and is what `react-hooks/set-state-in-effect` correctly objects to.

   useSyncExternalStore is built for exactly this shape: getServerSnapshot
   drives SSR and hydration, then React re-reads getSnapshot on the client and
   re-renders only if the real value differs. No mismatch, no cascade.
------------------------------------------------------------------------- */

const listeners = new Set<() => void>()

/** Referentially stable so useSyncExternalStore does not loop. */
let cachedSnapshot: ThemeSnapshot = { theme: DEFAULT_THEME, resolvedTheme: 'dark' }

const SERVER_SNAPSHOT: ThemeSnapshot = { theme: DEFAULT_THEME, resolvedTheme: 'dark' }

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored
  } catch {
    // Storage disabled (private browsing, blocked cookies). Fall through.
  }
  return DEFAULT_THEME
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Write the theme to <html>. Returns what is now actually painted. */
function applyTheme(theme: Theme): 'dark' | 'light' {
  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark())
  const root = document.documentElement
  root.classList.toggle('dark', isDark)
  root.style.colorScheme = isDark ? 'dark' : 'light'
  return isDark ? 'dark' : 'light'
}

/**
 * Pure read of external state. `resolvedTheme` comes from the DOM rather than
 * being recomputed, because ThemeScript already decided it before first paint
 * and the class on <html> is the thing the user is actually looking at.
 */
function getSnapshot(): ThemeSnapshot {
  const theme = readStoredTheme()
  const resolvedTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'

  if (cachedSnapshot.theme !== theme || cachedSnapshot.resolvedTheme !== resolvedTheme) {
    cachedSnapshot = { theme, resolvedTheme }
  }
  return cachedSnapshot
}

function getServerSnapshot(): ThemeSnapshot {
  return SERVER_SNAPSHOT
}

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  // Another tab changed the preference.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return
    applyTheme(readStoredTheme())
    emit()
  }
  window.addEventListener('storage', onStorage)

  // The OS flipped light/dark. Only meaningful while the preference is
  // 'system', but the listener is cheap and always-on avoids resubscribing.
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onMediaChange = () => {
    if (readStoredTheme() !== 'system') return
    applyTheme('system')
    emit()
  }
  media.addEventListener('change', onMediaChange)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
    media.removeEventListener('change', onMediaChange)
  }
}

export function setTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Theme still applies for this session, it just will not persist.
  }
  applyTheme(theme)
  emit()
}

export function useTheme(): ThemeSnapshot & { setTheme: (theme: Theme) => void } {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { ...snapshot, setTheme }
}

const noopSubscribe = () => () => {}

/**
 * True only after hydration. Same trick as above — it avoids a mount effect
 * whose entire job is to flip a boolean.
 */
export function useIsHydrated(): boolean {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}

/**
 * Blocking script injected ahead of first paint.
 *
 * This exists instead of a `next-themes` dependency because the whole problem
 * is ~15 lines: read the stored preference and stamp a class on <html> before
 * the browser paints. Doing it in an effect would flash the wrong theme on
 * every cold load, which is the one bug this has to avoid.
 *
 * It also sets `color-scheme`, so native UI — scrollbars, form controls, the
 * autofill background — follows the theme instead of staying light.
 */
export function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||${JSON.stringify(DEFAULT_THEME)};var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){document.documentElement.classList.add("dark")}})()`

  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />
}
