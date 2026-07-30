export type Route = 'show' | 'edit'

/**
 * Hash routing, not path routing: a static SPA on GitHub Pages cannot serve
 * `/edit` without a server rewrite.
 */
export function routeFromHash(hash: string): Route {
  // Order matters: the query has to come off before the trailing slash, or
  // `#/edit/?x=1` keeps its slash and stops matching.
  const path = hash.replace(/^#/, '').split('?')[0].replace(/\/$/, '')
  return path === '/edit' ? 'edit' : 'show'
}
