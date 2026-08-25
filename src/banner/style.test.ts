import { ACTIVE_NAMES, ENTER_NAMES, EXIT_NAMES, LOOK_NAMES } from 'klieg'
import { describe, expect, it } from 'vitest'
import { rollStyle } from './style'

/** Walks the unit interval, so every slot is asked for every name it has. */
const sweep = (steps: number) => {
  let i = 0
  return () => (i++ % steps) / steps
}

describe('rollStyle', () => {
  it('names motion and a material the library carries', () => {
    const style = rollStyle(() => 0.5)
    expect(ENTER_NAMES).toContain(style.enter)
    expect(ACTIVE_NAMES).toContain(style.active)
    expect(EXIT_NAMES).toContain(style.exit)
    expect(LOOK_NAMES).toContain(style.look)
  })

  it('never rolls a slot off', () => {
    for (let i = 0; i < 200; i++) {
      const style = rollStyle(Math.random)
      expect([style.enter, style.active, style.exit]).not.toContain('none')
    }
  })

  it('reaches every piece the library carries', () => {
    const rng = sweep(37)
    const rolls = Array.from({ length: 400 }, () => rollStyle(rng))
    // A pick that floored to a stale index, or an off-by-one at 1, would leave
    // a name unreachable and nothing else would notice.
    const seen = <T>(key: (s: (typeof rolls)[number]) => T) => new Set(rolls.map(key))
    expect(seen((s) => s.enter).size).toBe(ENTER_NAMES.length - 1)
    expect(seen((s) => s.active).size).toBe(ACTIVE_NAMES.length - 1)
    expect(seen((s) => s.exit).size).toBe(EXIT_NAMES.length - 1)
    expect(seen((s) => s.look).size).toBe(LOOK_NAMES.length)
  })

  it('takes an rng at its word at the top of the interval', () => {
    // rng() === 1 is out of contract, but floor(1 * n) would index past the end.
    const style = rollStyle(() => 1)
    expect(ENTER_NAMES).toContain(style.enter)
    expect(LOOK_NAMES).toContain(style.look)
  })

  it('sets the material it was named', () => {
    // An rng that would otherwise roll the first name in the list, so the
    // assertion cannot pass by landing on the right metal by chance.
    expect(rollStyle(() => 0).look).toBe(LOOK_NAMES[0])
    expect(rollStyle(() => 0, 'oil').look).toBe('oil')
  })

  it('keeps rolling the motion when the material is named', () => {
    const rng = sweep(37)
    const rolls = Array.from({ length: 400 }, () => rollStyle(rng, 'oil'))
    // Two landings on the same wedge are the same metal, never the same three
    // seconds of it.
    expect(new Set(rolls.map((s) => s.look))).toEqual(new Set(['oil']))
    expect(new Set(rolls.map((s) => s.enter)).size).toBe(ENTER_NAMES.length - 1)
    expect(new Set(rolls.map((s) => s.active)).size).toBe(ACTIVE_NAMES.length - 1)
  })

  it('rolls the material for a name the library does not carry', () => {
    // A typo, or an id a later build carries. Falling back beats drawing nothing.
    const rng = sweep(37)
    const rolls = Array.from({ length: 400 }, () => rollStyle(rng, 'brass'))
    expect(new Set(rolls.map((s) => s.look)).size).toBe(LOOK_NAMES.length)
  })

  it('rolls the material for an empty name', () => {
    const rng = sweep(37)
    const rolls = Array.from({ length: 400 }, () => rollStyle(rng, ''))
    expect(new Set(rolls.map((s) => s.look)).size).toBe(LOOK_NAMES.length)
  })
})
