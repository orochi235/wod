import { mix } from '@msb235/blits'
import { describe, expect, it } from 'vitest'
import { EASINGS } from '../keyframes/easing'
import type { Morph, Segment } from '../wheel/types'
import { composeSegments, segmentsAt } from './compose'
import { cueMorphs, morphVoices } from './morphVoices'
import { type WedgePose, wedgeKit } from './motion'

const D = 1000
const red: Segment = {
  id: 'x',
  label: 'X',
  weight: 3,
  color: '#ff0000',
  reveal: { headline: 'yes' },
}
const of = (segments: Segment[], id: string) => segments.find((s) => s.id === id) as Segment
const morph = (keyframes: Morph['keyframes'], extra: Partial<Morph> = {}): Morph => ({
  segmentId: 'x',
  durationMs: D,
  keyframes,
  ...extra,
})
const at = (segments: Segment[], morphs: Morph[], ms: number) =>
  of(segmentsAt(segments, morphs, ms), 'x')

describe('morphVoices', () => {
  it('turns weights into deltas from the base', () => {
    const [voice] = morphVoices(
      morph([
        { at: 0, weight: 3 },
        { at: 1, weight: 0 },
      ]),
      red,
      0,
    )
    expect(voice.patch.keys?.map((stop) => stop.delta.weight)).toEqual([0, -3])
  })

  it('emits a voice only for channels the morph touches', () => {
    expect(
      morphVoices(
        morph([
          { at: 0, weight: 3 },
          { at: 1, weight: 1 },
        ]),
        red,
        0,
      ),
    ).toHaveLength(1)
  })

  it('starts a lone late color stop from the base color', () => {
    const blue = [morph([{ at: 1, color: '#0000ff' }])]
    expect(at([red], blue, 0).color).toBe('#ff0000')
    expect(at([red], blue, D).color).toBe('#0000ff')
  })

  it('passes the morph easing through', () => {
    const eased = [
      morph(
        [
          { at: 0, weight: 3 },
          { at: 1, weight: 4 },
        ],
        { easing: 'easeIn' },
      ),
    ]
    expect(at([red], eased, D / 2).weight).toBeCloseTo(3 + EASINGS.easeIn(0.5), 9)
  })

  it('eases the whole morph, not each segment between its stops', () => {
    const vanish = [
      morph(
        [
          { at: 0, weight: 3 },
          { at: 0.5, weight: 3 },
          { at: 1, weight: 0 },
        ],
        { easing: 'easeIn' },
      ),
    ]
    // easeIn reaches progress 0.5 at time √0.5: the hold lasts until then, not until half time.
    expect(at([red], vanish, 700).weight).toBe(3)
    expect(at([red], vanish, 720).weight).toBeLessThan(3)
    expect(at([red], vanish, 850).weight).toBeCloseTo(
      3 - 3 * ((EASINGS.easeIn(0.85) - 0.5) / 0.5),
      9,
    )
  })

  it('clears a reveal at its stop', () => {
    const cleared = [morph([{ at: 0.5, reveal: null }])]
    expect(at([red], cleared, 490).reveal).toEqual({ headline: 'yes' })
    expect(at([red], cleared, 500).reveal).toBeUndefined()
  })

  it('holds the end value long after the morph ends', () => {
    const grow = [
      morph([
        { at: 0, weight: 3 },
        { at: 1, weight: 5 },
      ]),
    ]
    expect(at([red], grow, D + 5000).weight).toBe(5)
  })

  it('does not wrap back to the start past its end', () => {
    const grow = [
      morph([
        { at: 0, weight: 3 },
        { at: 1, weight: 5 },
      ]),
    ]
    expect(at([red], grow, D).weight).toBe(5)
    expect(at([red], grow, D + 1).weight).toBe(5)
  })

  it('composes an untouched wedge to its base, the same object', () => {
    const other: Segment = { id: 'o', label: 'O', weight: 1 }
    const grow = [
      morph([
        { at: 0, weight: 3 },
        { at: 1, weight: 5 },
      ]),
    ]
    expect(of(segmentsAt([red, other], grow, D / 2), 'o')).toBe(other)
  })

  it('waits out an outage prologue', () => {
    const wedges = mix<string, WedgePose>(wedgeKit)
    const grow = [
      morph([
        { at: 0, weight: 3 },
        { at: 1, weight: 5 },
      ]),
    ]
    cueMorphs(wedges, [red], grow, 12000)
    wedges.sync(11999)
    expect(wedges.probe('x').weight).toBe(0)
    wedges.sync(12000 + D / 2)
    expect(of(composeSegments([red], wedges), 'x').weight).toBe(at([red], grow, D / 2).weight)
  })

  it('plays faster under a rate, for a shortened spin', () => {
    const wedges = mix<string, WedgePose>(wedgeKit)
    const grow = [
      morph([
        { at: 0, weight: 3 },
        { at: 1, weight: 5 },
      ]),
    ]
    cueMorphs(wedges, [red], grow, 0, 10)
    wedges.sync(50)
    expect(of(composeSegments([red], wedges), 'x').weight).toBe(4)
  })
})

describe('two tricks on one wedge', () => {
  const two: Segment = { id: 'x', label: 'X', weight: 2, color: '#ff0000' }

  it('add their weight changes', () => {
    const vanish = morph([
      { at: 0, weight: 2 },
      { at: 1, weight: 0 },
    ])
    const takeover = morph([
      { at: 0, weight: 2 },
      { at: 1, weight: 5 },
    ])
    expect(at([two], [vanish, takeover], D).weight).toBe(3)
  })

  it('never take a weight below zero', () => {
    const vanish = morph([
      { at: 0, weight: 2 },
      { at: 1, weight: 0 },
    ])
    expect(at([two], [vanish, vanish], D).weight).toBe(0)
  })

  it('crossfade their colors', () => {
    const blue = morph([{ at: 0, color: '#0000ff' }])
    const green = morph([{ at: 0, color: '#00ff00' }])
    expect(at([two], [blue, green], D).color).toBe('#00bbe3')
  })

  it('let the later relabel win', () => {
    const a = morph([{ at: 0, label: 'A' }])
    const b = morph([{ at: 0, label: 'B' }])
    expect(at([two], [a, b], D).label).toBe('B')
  })
})
