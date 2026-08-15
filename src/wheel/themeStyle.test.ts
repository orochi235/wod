import { describe, expect, it } from 'vitest'
import { FLAT_METRICS } from './theme'
import type { Theme } from './theme'
import { styleOfTheme } from './themeStyle'

const theme = (tokens: Record<string, string>): Theme => ({
  id: 't',
  name: 'T',
  parts: {},
  metrics: FLAT_METRICS,
  tokens,
  pegs: { kind: 'bounds' },
  flapper: 'silent',
})

describe('styleOfTheme', () => {
  it('passes a token through as a custom property', () => {
    expect(styleOfTheme(theme({ '--wheel-rim-fill': 'gold' }))).toEqual({
      '--wheel-rim-fill': 'gold',
    })
  })

  it('keeps a token it has never heard of', () => {
    expect(styleOfTheme(theme({ '--wheel-future-thing': '3px' }))).toEqual({
      '--wheel-future-thing': '3px',
    })
  })

  it('drops a name outside the wheel scope', () => {
    // A stored theme could otherwise set --anything on the wheel root and reach
    // whatever else in the app inherits from it.
    expect(styleOfTheme(theme({ color: 'red', '--app-bg': 'red' }))).toEqual({})
  })

  it('drops a value that would close the declaration', () => {
    expect(styleOfTheme(theme({ '--wheel-rim-fill': 'gold; position: fixed' }))).toEqual({})
  })

  it('drops an empty value rather than emitting an empty property', () => {
    expect(styleOfTheme(theme({ '--wheel-rim-fill': '   ' }))).toEqual({})
  })
})
