export type Route = 'show' | 'edit'

/**
 * Hash routing, not path routing: a static SPA on GitHub Pages cannot serve
 * `/edit` without a server rewrite.
 */
export function routeFromHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/$/, '')
  return path === '/edit' ? 'edit' : 'show'
}
