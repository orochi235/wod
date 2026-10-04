import { type Patch, keys } from '@msb235/blits'
import type { WheelPose } from '../clock/motion'
import type { OutagePlan } from '../wheel/outage'
import { blackoutKeyframes, blackoutMs } from './schedule'

/** Over the spin from its start: lit, dark from the pop, lit again when the lights come back. */
export function darkPatch(plan: OutagePlan): Patch<string, WheelPose, void> {
  return keys<string, WheelPose>(plan.lightsAtMs, [
    { at: 0, delta: { dark: false } },
    { at: plan.popAtMs / plan.lightsAtMs, delta: { dark: true } },
    { at: 1, delta: { dark: false } },
  ])
}

/** The blackout's opacity from the pop, over `blackoutMs()`. */
export function blackoutPatch(depth: number): Patch<string, WheelPose, void> {
  return keys<string, WheelPose>(
    blackoutMs(),
    blackoutKeyframes(depth).map((frame) => ({
      at: frame.offset as number,
      delta: { blackout: Number(frame.opacity) },
    })),
  )
}
