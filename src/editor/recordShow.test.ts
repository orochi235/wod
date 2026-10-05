import { afterEach, describe, expect, it, vi } from 'vitest'
import { composeSegments } from '../clock/compose'
import { manualMotion } from '../clock/manual'
import { cueMorphs } from '../clock/morphVoices'
import { WHEEL, type WheelPose } from '../clock/motion'
import { blackoutVoice, darkVoice } from '../outage/voices'
import { angleVoice } from '../wheel/anglePatch'
import { arcs } from '../wheel/geometry'
import { type PegMode, pegAngles } from '../wheel/pegs'
import { type Show, planShow } from '../wheel/show'
import { trackFlapper } from '../wheel/trackFlapper'
import type { Segment, SpinConfig } from '../wheel/types'
import { FRAME_MS, recordShow } from './recordShow'

const segments: Segment[] = ['ana', 'ben', 'cy', 'dee'].map((id) => ({
  id,
  label: id,
  weight: 1,
  color: '#ff0000',
}))
const config: SpinConfig = {
  durationMs: 4500,
  fullSpins: 5,
  direction: 'cw',
  easing: [0.1, 0.8, 0.2, 1],
  outage: { cruiseMs: 1500, sparkMs: 800 },
  morphs: [
    {
      segmentId: 'ben',
      durationMs: 4500,
      keyframes: [
        { at: 0, weight: 1, color: '#ff0000' },
        { at: 1, weight: 4, color: '#0000ff' },
      ],
    },
  ],
}
const PEGS: PegMode = { kind: 'bounds' }
const show = planShow({ segments, config, rng: () => 0.5, from: 0, durationMs: 4500 }) as Show
const plan = show.outagePlan as NonNullable<Show['outagePlan']>
const recording = recordShow(show, { pegs: PEGS, depth: 0.6 })

/** The same show played live from `startedAt`, every frame stepped as the recording was. */
function playLive(startedAt: number) {
  const live = manualMotion()
  const { wheel, wedges, ticker } = live.motion
  wheel.cue(angleVoice(show.track, startedAt))
  wheel.cue(darkVoice(plan, startedAt))
  wheel.cue(blackoutVoice(0.6, startedAt + plan.popAtMs))
  cueMorphs(wedges, show.segments, show.morphs, startedAt + show.morphsAt)
  trackFlapper(live.motion, {
    pegs: () => pegAngles(PEGS, arcs(composeSegments(show.segments, wedges))),
    write: () => undefined,
    click: () => undefined,
  })
  ticker.stay()
  let frame = 0
  return {
    /** Steps every frame up to frame `k` and reads it. */
    to(k: number) {
      for (; frame <= k; frame++) live.step(startedAt + frame * FRAME_MS)
      return { wheel: wheel.probe(WHEEL), segments: composeSegments(show.segments, wedges) }
    },
  }
}

function expectSamePose(a: WheelPose, b: WheelPose) {
  expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
  for (const key of Object.keys(a) as (keyof WheelPose)[]) {
    const x = a[key]
    const y = b[key]
    if (typeof x === 'number' && typeof y === 'number') expect(x).toBeCloseTo(y, 6)
    else expect(x).toEqual(y)
  }
}

describe('recordShow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('spans the whole show, prologue included', () => {
    expect(recording.durationMs).toBe(show.track.durationMs)
    expect(recording.durationMs).toBeGreaterThan(plan.resumedAtMs)
  })

  it('matches a live run of the same show', () => {
    const live = playLive(1000)
    for (const k of [10, 300, 700, Math.floor(recording.durationMs / FRAME_MS)]) {
      const frame = live.to(k)
      const recorded = recording.at(k * FRAME_MS)
      expectSamePose(recorded.wheel, frame.wheel)
      expect(recorded.segments).toEqual(frame.segments)
    }
  })

  it('moves the flapper while the wheel turns', () => {
    const swung = Array.from({ length: 200 }, (_, i) => recording.at(i * FRAME_MS).wheel)
    expect(swung.some((pose) => Math.abs(pose.deflection ?? 0) > 1)).toBe(true)
  })

  it('reads the same frame after reading backward', () => {
    const first = recording.at(8000)
    recording.at(3000)
    expect(recording.at(8000)).toEqual(first)
  })

  it('shows the outage inside the dark', () => {
    const mid = (plan.popAtMs + plan.lightsAtMs) / 2
    expect(recording.at(mid).wheel.blackout).toBeGreaterThan(0)
    expect(recording.at(mid).wheel.dark).toBe(true)
  })

  it('lands on the planned frame', () => {
    expect(recording.at(recording.durationMs).segments).toEqual(show.landedFrame)
  })

  it('makes no sound', () => {
    const audio = vi.fn()
    vi.stubGlobal('AudioContext', audio)
    const again = recordShow(show, { pegs: PEGS, depth: 0.6 })
    for (let ms = 0; ms <= again.durationMs; ms += 250) again.at(ms)
    expect(audio).not.toHaveBeenCalled()
  })
})
