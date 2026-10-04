import { describe, expect, it } from 'vitest'
import { hexNumber } from '../wheel/hex'
import type { Morph, Segment } from '../wheel/types'
import golden from './__fixtures__/morph-golden.json'
import { segmentsAt } from './compose'

type Case = {
  segments: Segment[]
  morphs: Morph[]
  durationMs: number
  frames: { at: number; segments: Segment[] }[]
}

const linear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** Björn Ottosson's OKLab, to measure how far the new OKLCH blend sits from the old sRGB one. */
function oklab(color: string): [number, number, number] {
  const n = hexNumber(color) as number
  const [r, g, b] = [linear((n >> 16) & 255), linear((n >> 8) & 255), linear(n & 255)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

// Measured worst case over these fixtures' colors: 0.097, red to navy.
const OKLAB_TOLERANCE = 0.12

describe('a single trick, against the old applyMorphs', () => {
  for (const [name, c] of Object.entries(golden as Record<string, Case>)) {
    for (const frame of c.frames) {
      it(`${name} at ${frame.at}`, () => {
        const now = segmentsAt(c.segments, c.morphs, frame.at * c.durationMs)
        frame.segments.forEach((old, i) => {
          const next = now[i]
          expect(next.id).toBe(old.id)
          expect(next.weight).toBeCloseTo(old.weight, 9)
          expect(next.label).toBe(old.label)
          expect(next.media).toEqual(old.media)
          expect(next.reveal).toEqual(old.reveal)
          if (old.color === undefined || next.color === undefined) {
            expect(next.color).toBe(old.color)
          } else if (frame.at === 0 || frame.at === 1) {
            expect(next.color).toBe(old.color)
          } else {
            const [a, b] = [oklab(next.color), oklab(old.color)]
            expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(OKLAB_TOLERANCE)
          }
        })
      })
    }
  }
})
