import type { Presence, PresentationKeyframe } from './types'

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
 * Correct only because clip-path on a layout-less SVG element (a `<g>` or
 * `<path>`) resolves its reference box to fill-box; on an element with a
 * layout box the reference box is border-box and this constant is wrong.
 */
const FULL_APERTURE = 70.711

function round(value: number): string {
  // Trailing zeros make two identical transforms compare unequal as strings,
  // which is how a keyframe list ends up animating from a value to itself.
  return `${Number(value.toFixed(3))}`
}

/**
 * CSS, not the SVG transform attribute: these strings become WAAPI keyframes,
 * and CSS drops the whole transform, silently, if an angle lacks `deg` or a
 * length lacks `px`.
 */
export function transformOf(frame: PresentationKeyframe, target: EmitTarget): string {
  const parts: string[] = []

  if (frame.offset !== undefined && frame.offset !== 0) {
    const angle = frame.offsetAngle ?? target.angle
    parts.push(
      `rotate(${round(angle)}deg) translate(0px, ${round(-frame.offset * target.radius)}px) rotate(${round(-angle)}deg)`,
    )
  }

  if (frame.rotate !== undefined && frame.rotate !== 0) {
    parts.push(
      `rotate(${round(target.angle)}deg) translate(0px, ${round(-target.pivot)}px) rotate(${round(frame.rotate)}deg) translate(0px, ${round(target.pivot)}px) rotate(${round(-target.angle)}deg)`,
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
export type PresenceStyle = {
  '--wedge-transform': string
  '--wedge-opacity': string
  '--wedge-clip'?: string
}

/**
 * One presence as custom properties, which `.wheel__wedge` binds to the
 * properties they drive. `transformOf` and `clipOf` take a keyframe, and a
 * presence is a keyframe with every property present, so the arithmetic here is
 * the keyframe path's rather than a second copy of it.
 */
export function styleOf(presence: Presence, target: EmitTarget): PresenceStyle {
  const frame: PresentationKeyframe = { at: 0, ...presence }
  const style: PresenceStyle = {
    '--wedge-transform': transformOf(frame, target),
    '--wedge-opacity': `${presence.opacity}`,
  }
  if (presence.aperture < 1) style['--wedge-clip'] = clipOf(frame)
  return style
}

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
