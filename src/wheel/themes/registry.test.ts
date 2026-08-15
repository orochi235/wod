import { describe, expect, it } from 'vitest'
import { THEMES, THEME_LIST, getTheme } from './registry'

describe('getTheme', () => {
  it('finds a theme by id', () => {
    expect(getTheme('wof')?.id).toBe('wof')
  })

  it('returns null for an unknown id rather than throwing', () => {
    expect(getTheme('nope')).toBeNull()
  })

  it('returns null for a prototype key', () => {
    expect(getTheme('constructor')).toBeNull()
    expect(getTheme('__proto__')).toBeNull()
  })

  // The editor builds its menu from the list alone, so one missing from it is
  // unreachable while every other test still resolves it through THEMES.
  it('lists every theme it holds', () => {
    expect(THEME_LIST.map((theme) => theme.id)).toEqual(Object.keys(THEMES))
  })
})
