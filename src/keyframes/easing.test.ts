import { describe, expect, it } from 'vitest'
import type { EasingName } from '../wheel/types'
import { EASINGS, EASING_INVERSES } from './easing'

describe('EASING_INVERSES', () => {
  for (const name of Object.keys(EASINGS) as EasingName[]) {
    it(`undoes ${name}`, () => {
      for (const t of [0, 0.1, 0.25, 0.5, 0.6, 0.75, 0.9, 1]) {
        expect(EASING_INVERSES[name](EASINGS[name](t))).toBeCloseTo(t, 9)
      }
    })
  }
})
