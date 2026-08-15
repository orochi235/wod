import { describe, expect, it } from 'vitest'
import { TRANSITIONS, TRANSITION_LIST, getTransition } from './registry'

describe('getTransition', () => {
  it('finds a transition by id', () => {
    expect(getTransition('fade')?.id).toBe('fade')
  })

  it('returns null for an unknown id rather than throwing', () => {
    expect(getTransition('nope')).toBeNull()
  })

  // Ids come out of localStorage, and these resolve through the prototype chain.
  it('returns null for a prototype key', () => {
    expect(getTransition('constructor')).toBeNull()
    expect(getTransition('__proto__')).toBeNull()
    expect(getTransition('toString')).toBeNull()
  })

  it('lists every transition it can resolve', () => {
    for (const transition of TRANSITION_LIST) {
      expect(getTransition(transition.id)).toBe(transition)
    }
  })

  // The editor builds its menu from the list alone, so one missing from it is
  // unreachable while every other test still resolves it through TRANSITIONS.
  it('lists every transition it holds', () => {
    expect(TRANSITION_LIST.map((transition) => transition.id)).toEqual(Object.keys(TRANSITIONS))
  })
})
