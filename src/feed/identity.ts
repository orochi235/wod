import type { FeedItem } from './types'

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
export function slugify(name: string): string {
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
 * Gives every entry the first free id derived from its preferred one, so a
 * feed that cannot guarantee unique ids still produces unique wedges. Ids that
 * are already unique — a signed-in account id — pass through untouched.
 */
export function withUniqueIds(entries: FeedItem[]): FeedItem[] {
  const items: FeedItem[] = []
  for (const entry of entries) {
    let id = entry.id
    let n = 2
    while (items.some((item) => item.id === id)) {
      id = `${entry.id}-${n}`
      n += 1
    }
    items.push({ id, label: entry.label })
  }
  return items
}
