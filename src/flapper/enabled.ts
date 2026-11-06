const PARAM = 'songs'

/**
 * Whether the show page offers flapper songs: only with `songs` in the hash query
 * (`#/?songs`) until the feature is finished, so the meeting screen keeps its
 * controls as they were.
 */
export function songsEnabled(): boolean {
  try {
    const hash = window.location.hash.replace(/^#/, '')
    const cut = hash.indexOf('?')
    return cut !== -1 && new URLSearchParams(hash.slice(cut + 1)).has(PARAM)
  } catch {
    return false
  }
}
