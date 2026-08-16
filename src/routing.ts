import { getSample } from './preset/samples'

export type Route =
  | { kind: 'show' }
  | { kind: 'edit' }
  | { kind: 'slice' }
  | { kind: 'sample'; id: string }

/**
 * Hash routing, not path routing: a static SPA on GitHub Pages cannot serve
 * `/edit` without a server rewrite.
 *
 * A sample is one bare segment — `#/cash-wheel` — because it is a link someone
 * pastes into a meeting, and it is resolved here rather than left to the page:
 * a segment no build carries is not a route, it is a typo, and it lands on the
 * show page with the stored wheel it always did.
 */
export function routeFromHash(hash: string): Route {
  // Order matters: the query has to come off before the trailing slash, or
  // `#/edit/?x=1` keeps its slash and stops matching.
  const path = hash.replace(/^#/, '').split('?')[0].replace(/\/$/, '')
  if (path === '/edit') return { kind: 'edit' }
  if (path === '/slice') return { kind: 'slice' }

  const id = path.replace(/^\//, '')
  return getSample(id) ? { kind: 'sample', id } : { kind: 'show' }
}
