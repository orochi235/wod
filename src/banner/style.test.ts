import { ACTIVE_NAMES, ENTER_NAMES, EXIT_NAMES, LOOK_NAMES, specOf } from 'klieg'
import { describe, expect, it } from 'vitest'
import { LIGHTING_SHAPES, rollStyle } from './style'

/** Walks the unit interval, so every slot is asked for every name it has. */
const sweep = (steps: number) => {
  let i = 0
  return () => (i++ % steps) / steps
}

describe('rollStyle', () => {
  it('names motion, a material and lighting the library carries', () => {
    const style = rollStyle(() => 0.5)
    expect(ENTER_NAMES).toContain(style.enter)
    expect(ACTIVE_NAMES).toContain(style.active)
    expect(EXIT_NAMES).toContain(style.exit)
    expect(LOOK_NAMES).toContain(style.material)
    expect(LIGHTING_SHAPES).toContain(style.lit)
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
    expect(seen((s) => s.material).size).toBe(LOOK_NAMES.length)
    expect(seen((s) => s.lit).size).toBe(LIGHTING_SHAPES.length)
  })

  it('takes an rng at its word at the top of the interval', () => {
    // rng() === 1 is out of contract, but floor(1 * n) would index past the end.
    const style = rollStyle(() => 1)
    expect(ENTER_NAMES).toContain(style.enter)
    expect(LOOK_NAMES).toContain(style.material)
  })

  it('sets the material it was named', () => {
    // An rng that would otherwise roll the first name in the list, so the
    // assertion cannot pass by landing on the right metal by chance.
    expect(rollStyle(() => 0).material).toBe(LOOK_NAMES[0])
    expect(rollStyle(() => 0, 'oil').material).toBe('oil')
  })

  it('keeps rolling the motion when the material is named', () => {
    const rng = sweep(37)
    const rolls = Array.from({ length: 400 }, () => rollStyle(rng, 'oil'))
    // Two landings on the same wedge are the same metal, never the same three
    // seconds of it.
    expect(new Set(rolls.map((s) => s.material))).toEqual(new Set(['oil']))
    expect(new Set(rolls.map((s) => s.enter)).size).toBe(ENTER_NAMES.length - 1)
    expect(new Set(rolls.map((s) => s.active)).size).toBe(ACTIVE_NAMES.length - 1)
    expect(new Set(rolls.map((s) => s.lit)).size).toBe(LIGHTING_SHAPES.length)
  })

  it('rolls the material for a name the library does not carry', () => {
    // A typo, or an id a later build carries. Falling back beats drawing nothing.
    const rng = sweep(37)
    const rolls = Array.from({ length: 400 }, () => rollStyle(rng, 'brass'))
    expect(new Set(rolls.map((s) => s.material)).size).toBe(LOOK_NAMES.length)
  })

  it('draws gem as a film over the stock stone', () => {
    const style = rollStyle(() => 0, 'gem')
    expect(style.material).toBe('gem')
    // The material still names the wedge's metal; only what klieg extrudes grew.
    expect(style.look).not.toBe('gem')
    // Still gem's glass — transmission, ior, dispersion — with the film on top.
    const stock = specOf('gem')
    expect(style.look).toMatchObject({
      transmission: stock.transmission,
      ior: stock.ior,
      dispersion: stock.dispersion,
      iridescence: 1,
      tintTarget: 'attenuationColor',
    })
  })

  it('draws every other material as the name itself', () => {
    for (const name of LOOK_NAMES) {
      if (name === 'gem') continue
      expect(rollStyle(() => 0, name).look).toBe(name)
    }
  })

  it('layers the raked lighting and passes a named mode straight through', () => {
    const rng = sweep(37)
    const rolls = Array.from({ length: 400 }, () => rollStyle(rng))
    const raked = rolls.filter((style) => style.lit === 'raked')
    const named = rolls.filter((style) => style.lit !== 'raked')
    expect(raked.length).toBeGreaterThan(0)
    expect(named.length).toBeGreaterThan(0)
    // Two pieces on their own periods, which is what 0.10.0's slots added.
    for (const style of raked) expect(style.lighting).toHaveLength(2)
    for (const style of named) expect(style.lighting).toBe(style.lit)
  })

  it('does not repeat the roll it was handed', () => {
    // The docstring promises a meeting need not see the same one twice, and a
    // memoryless pick breaks that promise about one landing in five.
    const rng = sweep(37)
    let previous = rollStyle(rng, 'oil')
    for (let i = 0; i < 300; i++) {
      const next = rollStyle(rng, 'oil', previous)
      expect(next.enter).not.toBe(previous.enter)
      expect(next.active).not.toBe(previous.active)
      expect(next.exit).not.toBe(previous.exit)
      previous = next
    }
  })

  it('still reaches every piece when avoiding the last roll', () => {
    const rng = sweep(37)
    let previous = rollStyle(rng, 'oil')
    const rolls = [previous]
    for (let i = 0; i < 600; i++) {
      previous = rollStyle(rng, 'oil', previous)
      rolls.push(previous)
    }
    // Avoiding one name must not make any other unreachable.
    expect(new Set(rolls.map((s) => s.enter)).size).toBe(ENTER_NAMES.length - 1)
    expect(new Set(rolls.map((s) => s.active)).size).toBe(ACTIVE_NAMES.length - 1)
    expect(new Set(rolls.map((s) => s.exit)).size).toBe(EXIT_NAMES.length - 1)
  })

  it('rolls the material for an empty name', () => {
    const rng = sweep(37)
    const rolls = Array.from({ length: 400 }, () => rollStyle(rng, ''))
    expect(new Set(rolls.map((s) => s.material)).size).toBe(LOOK_NAMES.length)
  })
})
