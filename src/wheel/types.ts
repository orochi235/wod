import type { SliceInstance } from '../slice/types'

export type Media = { kind: 'emoji' | 'image' | 'gif'; value: string }

export type Reveal = {
  headline?: string
  body?: string
  media?: Media
  sound?: string
  effect?: 'confetti' | 'none'
  holdMs?: number
}

export type Segment = {
  id: string
  label: string
  /** Relative, not a percentage. Normalized at render time. Zero means present but invisible. */
  weight: number
  color?: string
  media?: Media
  reveal?: Reveal
  /** Overrides the wheel's layout for this wedge alone. */
  slice?: SliceInstance
  /**
   * The material this wedge's winner is announced in, as a validated string
   * rather than a union — the banner's library owns the names, and the wheel's
   * vocabulary should not depend on it to say a wedge has one. `banner/style.ts`
   * judges the id; one it does not carry rolls a material as if none were named.
   */
  look?: string
}

/** CSS cubic-bezier control points, in the order CSS writes them: x1, y1, x2, y2. */
export type Curve = [number, number, number, number]

/** A cruise that breaks into a stop. `ms` is how long the break lasts. */
export type Settle = { ms: number; curve: Curve }

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

export type MorphKeyframe = {
  /** Position within the morph's own duration, 0..1. */
  at: number
  weight?: number
  color?: string
  label?: string
  media?: Media
  /** `null` clears the reveal. Absent means this keyframe does not touch it. */
  reveal?: Reveal | null
}

export type Morph = {
  segmentId: string
  keyframes: MorphKeyframe[]
  durationMs: number
  easing?: EasingName
}

export type Direction = 'cw' | 'ccw'

export type SpinConfig = {
  durationMs: number
  fullSpins: number
  /** Which way the wheel turns. The pointer is fixed either way. */
  direction: Direction
  /** Serialized to a cubic-bezier string only where the Web Animations API demands one. */
  easing: Curve
  /** Absent: one curve for the whole rotation. Present: cruise, then break. */
  settle?: Settle
  morphs: Morph[]
}
