/**
 * The name behind one wedge, split for substitution. Empty strings rather than
 * optionals: every field is destined for a template, and a wedge with no person
 * behind it has to expand to nothing rather than to "undefined".
 */
export type NameContext = { name: string; first: string; last: string }

/** What a static wedge, and any wedge whose feed name is blank, expands against. */
export const NO_NAME: NameContext = { name: '', first: '', last: '' }

const TOKEN = /\{(name|first|last)\}/g

/**
 * Splits a display name at the first space: everything after it is the last
 * name, so "Ana Delacroix Ruiz" keeps both surnames and a middle name lands
 * there too. Meet hands over one `displayName` string and no structured given
 * or family name, so any split is a guess; this one is at least wrong in the
 * same direction every time.
 */
export function namesOf(displayName: string): NameContext {
  const name = displayName.trim().replace(/\s+/g, ' ')
  if (name === '') return NO_NAME
  const space = name.indexOf(' ')
  if (space === -1) return { name, first: name, last: '' }
  return { name, first: name.slice(0, space), last: name.slice(space + 1) }
}

/**
 * Substitutes `{name}`, `{first}` and `{last}`. An unrecognized `{token}` is
 * left alone, which is what lets authored text contain braces.
 *
 * Braces rather than `@`, which `targets.ts` has already claimed for selectors.
 *
 * Whitespace is collapsed afterwards because a token that expands to nothing
 * otherwise leaves a gap: "{first} {last} is out" on a mononym would render two
 * spaces. Nothing on a wheel needs a run of spaces preserved.
 */
export function expand(text: string, names: NameContext): string {
  if (!text.includes('{')) return text
  return text
    .replace(TOKEN, (_match, key: 'name' | 'first' | 'last') => names[key])
    .replace(/\s+/g, ' ')
    .trim()
}

/** A wedge with no entry has no person behind it, which is `NO_NAME` either way. */
export function nameFor(names: Map<string, NameContext> | undefined, id: string): NameContext {
  return names?.get(id) ?? NO_NAME
}
