import { describe, expect, it } from 'vitest'
import { STALE_MS, sparkCues, takeDue } from './cues'
import { BLOW_MS, escalation } from './schedule'

const plan = { sparkAtMs: 2000, popAtMs: 8000, lightsAtMs: 19000, resumedAtMs: 21000 }

describe('sparkCues', () => {
  it('starts the fault, plays the escalation, and blows before the pop', () => {
    const cues = sparkCues(plan)
    const sparkMs = plan.popAtMs - plan.sparkAtMs
    expect(cues[0]).toEqual({ at: 2000, kind: 'fault' })
    expect(cues.filter((cue) => cue.kind === 'shot')).toHaveLength(escalation(sparkMs).length)
    expect(cues.at(-1)).toEqual({ at: plan.popAtMs - BLOW_MS, kind: 'blow', sparkMs })
  })

  it('is in time order', () => {
    const times = sparkCues(plan).map((cue) => cue.at)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})

describe('takeDue', () => {
  const cues = [{ at: 0 }, { at: 100 }, { at: 200 }, { at: 300 }]

  it('fires a cue at 0 on the first frame, however late that frame starts', () => {
    expect(takeDue(cues, 0, 5, STALE_MS).fire).toEqual([{ at: 0 }])
  })

  it('fires each cue once across frames', () => {
    let cursor = 0
    const fired: number[] = []
    for (const elapsed of [50, 150, 150, 250, 400]) {
      const due = takeDue(cues, cursor, elapsed, STALE_MS)
      cursor = due.cursor
      fired.push(...due.fire.map((cue) => cue.at))
    }
    expect(fired).toEqual([0, 100, 200, 300])
  })

  it('skips cues gone stale, as after a hidden tab, without bursting them', () => {
    const due = takeDue(cues, 0, 451, STALE_MS)
    expect(due.fire).toEqual([{ at: 300 }])
    expect(due.cursor).toBe(4)
  })

  it('waits for a cue still ahead', () => {
    expect(takeDue(cues, 1, 99, STALE_MS)).toEqual({ fire: [], cursor: 1 })
  })
})
