import { describe, expect, it, vi } from 'vitest'
import { fakeMotion } from '../clock/testing'
import { createBlackoutCover, cueBlackout } from './blackout'
import { blackoutKeyframes, blackoutMs } from './schedule'

const cover = () => document.querySelector<HTMLElement>('.outage-blackout')
const level = () => Number(cover()?.style.getPropertyValue('--blackout'))

describe('cueBlackout', () => {
  it('covers the window and follows the schedule from its start', () => {
    const { motion, step } = fakeMotion()
    const blackout = cueBlackout(motion, 1000, 1)
    expect(cover()).not.toBeNull()
    const frame = blackoutKeyframes(1)[5]
    step(1000 + (frame.offset as number) * blackoutMs())
    expect(level()).toBeCloseTo(Number(frame.opacity), 9)
    blackout.stop()
  })

  it('takes the cover down when it ends, and lets the clock sleep', async () => {
    const { motion, step, waiting } = fakeMotion()
    cueBlackout(motion, 0, 1)
    step(blackoutMs() / 2)
    step(blackoutMs())
    await vi.waitFor(() => expect(cover()).toBeNull())
    step(blackoutMs() + 16)
    expect(waiting()).toBe(false)
  })

  it('stops at once, cover and all', () => {
    const { motion, step, waiting } = fakeMotion()
    const blackout = cueBlackout(motion, 0, 1)
    step(100)
    blackout.stop()
    expect(cover()).toBeNull()
    step(116)
    expect(waiting()).toBe(false)
  })

  it('leaves one cover when a newer outage cuts an older one short', () => {
    const { motion, step } = fakeMotion()
    const first = cueBlackout(motion, 0, 1)
    step(100)
    first.stop()
    const second = cueBlackout(motion, 100, 1)
    expect(document.querySelectorAll('.outage-blackout')).toHaveLength(1)
    second.stop()
  })

  it('makes a cover that sets its own darkness and leaves', () => {
    const cover = createBlackoutCover(document)
    cover.set(0.4)
    const node = document.querySelector('.outage-blackout') as HTMLElement
    expect(node.style.getPropertyValue('--blackout')).toBe('0.4')
    cover.remove()
    expect(document.querySelector('.outage-blackout')).toBeNull()
  })
})
