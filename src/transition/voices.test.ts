import { mix } from '@msb235/blits'
import { describe, expect, it } from 'vitest'
import { type WedgePose, wedgeKit } from '../clock/motion'
import { TRANSITIONS } from './registry'
import type { Presence, TransitionId } from './types'
import { type PresencePlan, RESTING, presenceOf, presenceVoice, stopsOf } from './voices'

const planOf = (id: TransitionId, moment: 'enter' | 'exit'): PresencePlan => {
  const { keyframes, delayMs, easing } = TRANSITIONS[id].frames(
    { staggerMs: 0, durationMs: 400 },
    { index: 0, count: 1, angle: 0, durationMs: 400, moment },
  )
  return { frames: keyframes, delayMs, durationMs: 400, easing }
}

/** What the old sampler drew at 0, 200 and 400 ms. */
const TODAY: Record<string, Partial<Presence>[]> = {
  'fade.enter': [{ opacity: 0 }, { opacity: 0.75 }, {}],
  'fade.exit': [{}, { share: 0.25, opacity: 0.25 }, { share: 0, opacity: 0 }],
  'fly.enter': [
    { opacity: 0, scale: 0.9, offset: 1.6 },
    { opacity: 0.75, scale: 0.975, offset: 0.4 },
    {},
  ],
  'fly.exit': [
    {},
    { share: 0.25, opacity: 0.25, scale: 0.925, offset: 1.2 },
    { share: 0, opacity: 0, scale: 0.9, offset: 1.6 },
  ],
  'shrink.enter': [
    { share: 0, opacity: 0, scale: 0 },
    { share: 0.5, opacity: 0.5, scale: 0.5 },
    {},
  ],
  'shrink.exit': [{}, { share: 0.5, opacity: 0.5, scale: 0.5 }, { share: 0, opacity: 0, scale: 0 }],
}

describe('a transition as a voice', () => {
  for (const [name, expected] of Object.entries(TODAY)) {
    // 0.4.0: an exit's 400 ms frame is its held last frame.
    it(`plays ${name} as today`, () => {
      const [id, moment] = name.split('.') as [TransitionId, 'enter' | 'exit']
      const w = mix<string, WedgePose>(wedgeKit)
      const spec = presenceVoice('ana', planOf(id, moment), moment, 0, null)
      if (!spec) throw new Error('no voice')
      w.cue(spec)
      ;[0, 200, 400].forEach((t, i) => {
        w.sync(t)
        const got = presenceOf(w.probe('ana'))
        for (const [key, value] of Object.entries({ ...RESTING, ...expected[i] })) {
          expect(got[key as keyof Presence], `${key} at ${t}`).toBeCloseTo(value as number, 6)
        }
      })
    })
  }
})

describe('stopsOf', () => {
  it('starts a channel declared late from rest, as the old sampler did', () => {
    const stops = stopsOf(
      [
        { at: 0.5, opacity: 0 },
        { at: 1, opacity: 1 },
      ],
      'enter',
      null,
    )
    expect(stops).toEqual([
      { at: 0, delta: { opacity: 1, share: 1 } },
      { at: 0.5, delta: { opacity: 0 } },
      { at: 1, delta: { opacity: 1, share: 1 } },
    ])
  })

  it('ramps share in when the transition declares none', () => {
    const stops = stopsOf([{ at: 0, opacity: 0 }], 'enter', { ...RESTING, share: 0.3 })
    expect(stops[0].delta.share).toBe(0.3)
    expect(stops.at(-1)?.delta.share).toBe(1)
  })

  it('releases share on the way out when the transition declares none', () => {
    const stops = stopsOf([{ at: 1, opacity: 0 }], 'exit', null)
    expect(stops[0].delta.share).toBe(1)
    expect(stops.at(-1)?.delta.share).toBe(0)
  })

  it('leaves share to a transition that declares it', () => {
    const stops = stopsOf(
      [
        { at: 0, share: 1 },
        { at: 1, share: 0 },
      ],
      'exit',
      null,
    )
    expect(stops.map((stop) => stop.delta.share)).toEqual([1, 0])
  })

  it('takes a silent channel back to rest when an entrance interrupts', () => {
    const stops = stopsOf([{ at: 1, opacity: 1 }], 'enter', { ...RESTING, offset: 0.4 })
    expect(stops[0].delta.offset).toBe(0.4)
    expect(stops.at(-1)?.delta.offset).toBe(0)
  })

  it('holds a silent channel where it stands when an exit interrupts', () => {
    const stops = stopsOf([{ at: 1, opacity: 0 }], 'exit', { ...RESTING, offset: 0.4 })
    expect(stops[0].delta.offset).toBe(0.4)
    expect(stops.at(-1)?.delta.offset).toBe(0.4)
  })

  it('leaves the direction out unless a frame names one', () => {
    const stops = stopsOf([{ at: 0, offset: 1 }], 'enter', null)
    expect(stops.every((stop) => !('offsetAngle' in stop.delta))).toBe(true)
  })
})

describe('presenceVoice', () => {
  const plan: PresencePlan = { frames: [{ at: 0, opacity: 0 }], delayMs: 200, durationMs: 400 }

  it('holds an entrance both ways and an exit after', () => {
    expect(presenceVoice('ana', plan, 'enter', 0, null)?.hold).toBe('both')
    expect(presenceVoice('ana', plan, 'exit', 0, null)?.hold).toBe('after')
  })

  it('holds an interrupting exit both ways, so it waits out its stagger where it stands', () => {
    expect(presenceVoice('ana', plan, 'exit', 0, RESTING)?.hold).toBe('both')
  })

  it('starts after its stagger, in the wedge own locus', () => {
    const spec = presenceVoice('ana', plan, 'enter', 1000, null)
    expect(spec).toMatchObject({ start: 1200, subjects: ['ana'], locus: 'presence:ana' })
    expect(spec?.loop).toBe(false)
  })

  it('reads from where the wedge stands only when it interrupts', () => {
    expect(presenceVoice('ana', plan, 'enter', 0, null)?.from).toBeUndefined()
    expect(presenceVoice('ana', plan, 'enter', 0, RESTING)?.from).toBe('current')
  })

  it('cues nothing for a transition with no duration', () => {
    expect(presenceVoice('ana', { ...plan, durationMs: 0 }, 'enter', 0, null)).toBeNull()
  })
})

describe('presenceOf', () => {
  it('fills what a pose leaves out from rest', () => {
    expect(presenceOf({})).toEqual(RESTING)
  })

  it('keeps a direction only when the pose has one', () => {
    expect(presenceOf({ offsetAngle: 30 }).offsetAngle).toBe(30)
    expect('offsetAngle' in presenceOf({})).toBe(false)
  })
})
