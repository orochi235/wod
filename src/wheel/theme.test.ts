import { describe, expect, it } from 'vitest'
import { FLAT_METRICS, partOn } from './theme'
import type { Theme } from './theme'
import { flat } from './themes/flat'
import { wof } from './themes/wof'

const bare: Theme = {
  id: 'bare',
  name: 'Bare',
  parts: {},
  metrics: FLAT_METRICS,
  tokens: {},
  pegs: { kind: 'bounds' },
  flapper: 'silent',
}

describe('partOn', () => {
  it('leaves a part a theme does not name off', () => {
    expect(partOn(bare, 'rim')).toBe(false)
    expect(partOn(bare, 'peg')).toBe(false)
  })

  it('turns on what a theme asks for', () => {
    expect(partOn({ ...bare, parts: { rim: true } }, 'rim')).toBe(true)
  })

  it('lets a theme turn a part back off explicitly', () => {
    expect(partOn({ ...bare, parts: { rim: false } }, 'rim')).toBe(false)
  })
})

describe('the flat look', () => {
  // Absent means flat, and flat has to be indistinguishable from no theme at
  // all. The pointer is the one part the wheel already drew before themes, so
  // flat keeps it and adds nothing else.
  it('adds no part beyond the pointer it already drew', () => {
    expect(flat.parts.pointer).toBe(true)
    expect(Object.values({ ...flat.parts, pointer: false }).every((on) => on === false)).toBe(true)
  })

  it('asks for no pegs and a silent flapper', () => {
    expect(flat.pegs).toEqual({ kind: 'fixed', count: 0 })
    expect(flat.flapper).toBe('silent')
  })
})

describe('the wof look', () => {
  it('turns on the machinery that makes it read as a wheel', () => {
    for (const part of ['rim', 'peg', 'flapper', 'hub', 'panel'] as const) {
      expect(partOn(wof, part)).toBe(true)
    }
  })

  it('puts its pegs on the wedge boundaries', () => {
    expect(wof.pegs).toEqual({ kind: 'bounds' })
  })

  it('keeps its panel inside the face', () => {
    const [inner, outer] = wof.metrics.panel
    expect(inner).toBeGreaterThan(0)
    expect(outer).toBeLessThan(1)
    expect(inner).toBeLessThan(outer)
  })

  it('names only tokens the wheel scopes', () => {
    for (const key of Object.keys(wof.tokens)) {
      expect(key.startsWith('--wheel-') || key.startsWith('--wedge-')).toBe(true)
    }
  })
})
