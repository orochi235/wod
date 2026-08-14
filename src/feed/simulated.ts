import type { Rng } from '../wheel/selection'
import { slugify, withUniqueIds } from './identity'
import type { FeedItem, SimulatedFeedConfig } from './types'

/**
 * Autochurn runs off setInterval, and browsers floor nested timers at 4ms: a
 * shorter period than this republishes the roster hundreds of times a second,
 * recomposing and re-rendering the wheel on each one. Same reasoning as
 * readMotion clamping durationMs for Element.animate().
 *
 * It lives with the simulator rather than with the preset parser because it
 * describes how fast this simulation can be driven, not what the stored format
 * allows — every caller that starts a clock has to honor it, and the parser is
 * only one of them.
 */
export const MIN_CHURN_INTERVAL_MS = 250

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
}

/**
 * One tick of the simulated meeting.
 *
 * At most one person moves per tick of autochurn, so the roster reads as
 * people arriving and leaving rather than as a list being regenerated —
 * which is what makes it useful for finding the races a real meeting would
 * produce.
 *
 * Reconciling an edited pool is separate: every ghost leaves at once, because
 * a name the pool no longer offers must never stay spinnable.
 */
export function churn(config: SimulatedFeedConfig, present: string[], rng: Rng): string[] {
  // Editing the pool must not leave ghosts in the room. Filtering by value
  // rather than index also means a pool with a repeated name can never leave
  // two copies of it in `current` — the second occurrence is excluded from
  // `absent` the moment the first one is present, so it can never be picked.
  const current = present.filter((name) => config.pool.includes(name))
  // A pool edit is not a churn move — it's the operator changing who's even
  // eligible, not the simulation aging the roster. Stacking a fill on top of
  // it would conflate that edit with simulated motion, so it's applied on its
  // own and autochurn resumes next tick.
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
 * Ids derive from the name rather than from a counter, so leaving and rejoining
 * returns the same id and whatever override was saved against it.
 *
 * Two people with the same name still share one id, and a third whose own name
 * collides with the suffixed form takes it in list order. A simulated meeting
 * has no identity to key on but the name; the Meet feed keys on the account id
 * and does not have this problem.
 */
export function itemsFor(present: string[]): FeedItem[] {
  return withUniqueIds(present.map((name) => ({ id: slugify(name), label: name })))
}
