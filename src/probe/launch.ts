const PARAM = 'token'

/**
 * Reads `#token=` and strips it, so the probe can be launched armed:
 *
 *   open "http://localhost:5173/probe.html#token=$(scripts/token.sh)"
 *
 * A fragment rather than a query string: fragments are never sent to a server,
 * and this one holds an hour of read access to the operator's meetings.
 */
export function consumeTokenFromHash(): string | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash === '') return null

  const query = new URLSearchParams(hash)
  const token = query.get(PARAM)
  if (token === null) return null

  query.delete(PARAM)
  const rest = query.toString()
  // replaceState, not assignment: Back must not restore a url holding the token.
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ''}`,
  )
  return token === '' ? null : token
}
