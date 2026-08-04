import type { Rng } from '../wheel/selection'
import type { FeedItem, SimulatedFeedConfig } from './types'

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
}

/**
 * One tick of the simulated meeting. At most one person moves per tick, so the
 * roster reads as people arriving and leaving rather than as a list being
 * regenerated — which is what makes it useful for finding the races a real
 * meeting would produce.
 */
export function churn(config: SimulatedFeedConfig, present: string[], rng: Rng): string[] {
  // Editing the pool must not leave ghosts in the room. Filtering by value
  // rather than index also means a pool with a repeated name can never leave
  // two copies of it in `current` — the second occurrence is excluded from
  // `absent` the moment the first one is present, so it can never be picked.
  const current = present.filter((name) => config.pool.includes(name))
  // Dropping a name the pool no longer offers is itself this tick's move.
  // Stacking a fill or swap on top of it would move two people in one tick,
  // which breaks the "at most one move per tick" contract below.
  if (current.length !== present.length) return current

  const absent = config.pool.filter((name) => !current.includes(name))
  const target = Math.min(Math.max(0, config.autochurn.targetSize), config.pool.length)

  if (current.length < target && absent.length > 0) return [...current, pick(absent, rng)]
  if (current.length > target) {
    const leaving = pick(current, rng)
    return current.filter((name) => name !== leaving)
  }

  // At size. Volatility decides how often anyone moves at all.
  if (rng() >= config.autochurn.volatility) return current
  if (current.length === 0 || absent.length === 0) return current
  const leaving = pick(current, rng)
  const joining = pick(absent, rng)
  return [...current.filter((name) => name !== leaving), joining]
}

/**
 * Keeps any Unicode letter or number verbatim (after composing combining marks,
 * so the same name typed in two normalization forms still slugifies the same
 * way) and collapses everything else to a hyphen. A stricter ASCII-only class
 * would fold every non-Latin name to the empty-id fallback: two attendees named
 * '李雷' and '王芳' would both become 'item'/'item-2', ids assigned by list
 * position rather than by name — which breaks the promise that an id follows a
 * person across a leave and rejoin. It also never emits ':', which matters
 * because this id becomes half of a wedge id (`${feedId}:${itemId}`); a colon
 * here would make that string ambiguous to split back apart.
 */
function slugify(name: string): string {
  const slug = name
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  // An id is the override key, so it can never be empty — two unnameable
  // people would otherwise share one override.
  return slug === '' ? 'item' : slug
}

/**
 * Ids derive from the name rather than from a counter, so leaving and rejoining
 * returns the same id and whatever override was saved against it.
 */
export function itemsFor(present: string[]): FeedItem[] {
  const items: FeedItem[] = []
  for (const name of present) {
    const base = slugify(name)
    let id = base
    let n = 2
    while (items.some((item) => item.id === id)) {
      id = `${base}-${n}`
      n += 1
    }
    items.push({ id, label: name })
  }
  return items
}
