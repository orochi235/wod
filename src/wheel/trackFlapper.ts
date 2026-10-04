import { spring } from '@msb235/blits'
import { type Motion, WHEEL, type WheelPose } from '../clock/motion'
import { STILL_SPEED, deflectionDeg, pegCrossings } from './flapper'

/** Critically damped and stiff: the arm follows a peg closely and falls in about 100 ms. */
const STIFFNESS = 2000
const DAMPING = 2 * Math.sqrt(STIFFNESS)

export type FlapperArm = {
  /** Where the pegs are now, as turns. Read each frame; the roster can change them. */
  pegs: () => number[]
  /** Puts the arm at `deg`. Called only when it moved. */
  write: (deg: number) => void
  /** `count` pegs went under the hinge, at `speed` degrees per millisecond. */
  click: (count: number, speed: number) => void
}

/**
 * Drives the flapper off the wheel mix's angle: aims a spring at the push the
 * nearest peg gives, or at upright once the wheel is still, and counts pegs for
 * the clicker. Returns the cleanup.
 */
export function trackFlapper({ ticker, wheel }: Motion, arm: FlapperArm): () => void {
  const swing = spring<string, WheelPose>('deflection', {
    to: 0,
    stiffness: STIFFNESS,
    damping: DAMPING,
  })
  const voice = wheel.cue({ patch: swing, subjects: [WHEEL] })
  let aim = 0
  let lastAngle: number | null = null
  let shown = 0

  const off = ticker.subscribe(() => {
    const pose = wheel.probe(WHEEL)
    const angle = pose.angle ?? 0
    const speed = pose.speed ?? 0
    const pegs = arm.pegs()

    const target = Math.abs(speed) > STILL_SPEED ? deflectionDeg(angle, pegs, speed) : 0
    if (target !== aim) {
      aim = target
      swing.to(WHEEL, target)
    }

    if (lastAngle !== null && angle !== lastAngle) {
      // The clicker rates its own volume off how fast, never which way.
      arm.click(pegCrossings(lastAngle, angle, pegs, speed), Math.abs(speed))
    }
    lastAngle = angle

    const deflection = pose.deflection ?? 0
    if (deflection !== shown) {
      shown = deflection
      arm.write(deflection)
    }
  })

  return () => {
    off()
    voice.fade({ over: 0 })
  }
}
