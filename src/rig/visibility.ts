/**
 * Whether the editor shows its rigging. Hiding it is cosmetic — tricks resolve
 * the same either way — and it only stops a casual look: the preset in
 * localStorage carries the tricks regardless.
 */
export const RIG_KEY = 'wod.rig.visible'

const PARAM = 'rig'

export function isRigVisible(): boolean {
  try {
    return window.localStorage.getItem(RIG_KEY) === '1'
  } catch {
    // Storage refused. The locked editor is the safe answer: it gives nothing away.
    return false
  }
}

function store(visible: boolean): void {
  try {
    if (visible) window.localStorage.setItem(RIG_KEY, '1')
    else window.localStorage.removeItem(RIG_KEY)
  } catch {
    // Same as savePreset: a private-mode restriction leaves the flag unset.
  }
}

/**
 * Applies `?rig=` from the hash, then rewrites the hash without it. Call once at
 * startup, before the first render, so an unlock does not flash the locked
 * layout.
 */
export function consumeRigParam(): void {
  const hash = window.location.hash.replace(/^#/, '')
  const cut = hash.indexOf('?')
  if (cut === -1) return

  const query = new URLSearchParams(hash.slice(cut + 1))
  if (!query.has(PARAM)) return

  store(query.get(PARAM) === '1')

  query.delete(PARAM)
  const rest = query.toString()
  const next = `#${hash.slice(0, cut)}${rest ? `?${rest}` : ''}`
  // replaceState, not assignment: Back must not return to the unlocking url.
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${next}`,
  )
}
