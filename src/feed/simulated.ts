import type { Rng } from '../wheel/selection'
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
 * Keeps any Unicode letter, number, or combining mark verbatim (after
 * composing to NFKC, so the same name typed in two normalization forms still
 * slugifies the same way) and collapses everything else to a hyphen. Marks
 * matter as much as letters here: several scripts spell vowels with a
 * combining mark rather than a base letter (Hindi 'नमस्ते', Hebrew 'שָׁלוֹם',
 * Arabic 'مُحَمَّد'), so a letters-only class would silently drop those sounds
 * and fragment the name into several hyphenated pieces. A stricter ASCII-only
 * class would go further and fold every non-Latin name to the empty-id
 * fallback: two attendees named '李雷' and '王芳' would both become
 * 'item'/'item-2', ids assigned by list position rather than by name — which
 * breaks the promise that an id follows a person across a leave and rejoin.
 * It also never emits ':', which matters because this id becomes half of a
 * wedge id (`${feedId}:${itemId}`); a colon here would make that string
 * ambiguous to split back apart.
 *
 * A name made entirely of marks with no base letter or number (vanishingly
 * unlikely, but possible) slugifies to a dangling mark rather than falling
 * back to 'item' — the fallback only fires on a truly empty result. That id
 * is still stable and unique, just visually odd in a debugger.
 */
function slugify(name: string): string {
  const slug = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  // An id is the override key, so it can never be empty — two unnameable
  // people would otherwise share one override.
  return slug === '' ? 'item' : slug
}

/**
 * Ids derive from the name rather than from a counter, so leaving and rejoining
 * returns the same id and whatever override was saved against it.
 *
 * That derivation is name-based, not person-based, so it has a real bound:
 * with two identically-named people plus a third whose own name collides with
 * the suffixed form (['Ana', 'Ana', 'Ana 2']), the second 'Ana' takes the
 * '-2' id ahead of 'Ana 2', and 'Ana 2' is bumped to '-3' — its saved override
 * silently follows whoever slugifies to '-2' first, and that pick depends on
 * list order. Fixing this needs a real participant id, which is out of scope
 * until the Meet adapter supplies one.
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
