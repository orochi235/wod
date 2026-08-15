import { type RefObject, useEffect, useRef } from 'react'

const MATRIX = /^matrix\(([^)]*)\)$/
const DEGREES = /^rotate\(([-\d.]+)deg\)$/

/** Degrees clockwise, 0…360, out of whatever `getComputedStyle` reports. */
export function angleOfMatrix(transform: string): number | null {
  const degrees = DEGREES.exec(transform)
  if (degrees) return ((Number.parseFloat(degrees[1]) % 360) + 360) % 360

  const match = MATRIX.exec(transform)
  if (!match) return null
  const parts = match[1].split(',').map((n) => Number.parseFloat(n))
  if (parts.length < 4 || parts.some((n) => !Number.isFinite(n))) return null
  const [a, b] = parts
  const deg = (Math.atan2(b, a) * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

/**
 * The wheel's angle and how fast it is turning, once per frame, read off what
 * the compositor actually drew. Speed is degrees per millisecond, unsigned by
 * the caller's reckoning — it is the raw difference, so a wheel crossing 360
 * reports the small step rather than a full turn backwards.
 */
export function useWheelAngle(
  ref: RefObject<SVGGElement | null>,
  running: boolean,
  onSample: (angleDeg: number, speedDegPerMs: number) => void,
): void {
  const sampleRef = useRef(onSample)
  sampleRef.current = onSample

  useEffect(() => {
    if (!running) return
    const node = ref.current
    if (!node) return

    let frame = 0
    let stopped = false
    let lastAngle: number | null = null
    let lastNow = 0

    const tick = (now: number) => {
      // A frame already handed to the compositor still runs after its cancel,
      // and would sample a node this effect no longer owns.
      if (stopped) return
      const angle = angleOfMatrix(window.getComputedStyle(node).transform ?? '')
      if (angle !== null) {
        let speed = 0
        if (lastAngle !== null && now > lastNow) {
          // Shortest way round: a wheel passing 12 o'clock steps a few degrees,
          // not 359 of them backwards.
          let delta = angle - lastAngle
          if (delta > 180) delta -= 360
          if (delta < -180) delta += 360
          speed = Math.abs(delta) / (now - lastNow)
        }
        lastAngle = angle
        lastNow = now
        sampleRef.current(angle, speed)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
    }
  }, [ref, running])
}
