/**
 * What a face is shown setting in the picker. Eleven glyphs, not one repeated:
 * `g` drops a descender, `h` raises an ascender, `B`/`a`/`c` turn bowls, `s`
 * carries the spine, and 8/5/0 are three different constructions. A word would
 * spend the width repeating a letter, and a jumble of unrelated ones reads as
 * damage rather than as type.
 */
export const DEFAULT_SPECIMEN = 'Big cash $850'

const PARAM = 'specimen'

/**
 * The hash query overrides it, so a face can be judged against the text it will
 * actually set without a rebuild — `#/edit?specimen=Ana Whitekust`. Read once
 * per call rather than cached: nothing here is hot, and a stale specimen after
 * an edit to the url is the more surprising answer.
 */
export function specimenText(override?: string): string {
  if (override !== undefined && override !== '') return override

  try {
    const hash = window.location.hash.replace(/^#/, '')
    const cut = hash.indexOf('?')
    if (cut === -1) return DEFAULT_SPECIMEN
    const asked = new URLSearchParams(hash.slice(cut + 1)).get(PARAM)
    return asked === null || asked === '' ? DEFAULT_SPECIMEN : asked
  } catch {
    return DEFAULT_SPECIMEN
  }
}
