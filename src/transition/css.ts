import type { PresentationKeyframe } from './types'

export type EmitTarget = {
  /** The element's own angle, degrees clockwise from 12 o'clock. Zero at wheel scope. */
  angle: number
  radius: number
  /** Distance from the hub to the rotation pivot. Zero at wheel scope. */
  pivot: number
}

/**
 * Half the diagonal of a unit box, as a percentage: the radius at which a
 * centered circle covers the whole element, so aperture 1 clips nothing.
 */
const FULL_APERTURE = 70.711

function round(value: number): string {
  // Trailing zeros make two identical transforms compare unequal as strings,
  // which is how a keyframe list ends up animating from a value to itself.
  return `${Number(value.toFixed(3))}`
}

export function transformOf(frame: PresentationKeyframe, target: EmitTarget): string {
  const parts: string[] = []

  if (frame.offset !== undefined && frame.offset !== 0) {
    const angle = frame.offsetAngle ?? target.angle
    parts.push(
      `rotate(${round(angle)}) translate(0 ${round(-frame.offset * target.radius)}) rotate(${round(-angle)})`,
    )
  }

  if (frame.rotate !== undefined && frame.rotate !== 0) {
    parts.push(
      `rotate(${round(target.angle)}) translate(0 ${round(-target.pivot)}) rotate(${round(frame.rotate)}) translate(0 ${round(target.pivot)}) rotate(${round(-target.angle)})`,
    )
  }

  if (frame.scale !== undefined && frame.scale !== 1) {
    parts.push(`scale(${round(frame.scale)})`)
  }

  return parts.length === 0 ? 'none' : parts.join(' ')
}

export function clipOf(frame: PresentationKeyframe): string {
  const aperture = frame.aperture ?? 1
  return `circle(${round(aperture * FULL_APERTURE)}% at 50% 50%)`
}

/**
 * WAAPI interpolates a property that appears in only some keyframes from the
 * element's computed style, which is a different animation from the authored
 * one. Every property any frame mentions is therefore emitted on all of them.
 */
export function toKeyframes(frames: PresentationKeyframe[], target: EmitTarget): Keyframe[] {
  const hasOpacity = frames.some((frame) => frame.opacity !== undefined)
  const hasAperture = frames.some((frame) => frame.aperture !== undefined)

  return frames.map((frame) => {
    const keyframe: Keyframe = {
      offset: frame.at,
      transform: transformOf(frame, target),
    }
    if (hasOpacity) keyframe.opacity = frame.opacity ?? 1
    if (hasAperture) keyframe.clipPath = clipOf(frame)
    return keyframe
  })
}
