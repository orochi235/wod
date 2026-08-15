import type { Field } from '../form/fields'
import type { EasingName } from '../wheel/types'

export type TransitionId = 'fade' | 'fly' | 'shrink'

export type TransitionParams = Record<string, unknown>

export type TransitionScope = 'wedge' | 'wheel'

export type PresentationKeyframe = {
  /** Position within the transition's own duration, 0..1. */
  at: number
  /** 0…1 of the wedge's authored weight it occupies. The one property here that changes geometry. */
  hold?: number
  opacity?: number
  scale?: number
  /** Radial, in wheel radii: 1 is one radius out from the hub. */
  offset?: number
  /** Which way `offset` points, degrees clockwise from 12 o'clock. Defaults to the wedge's own angle. */
  offsetAngle?: number
  /** Degrees, about the wedge's arc midpoint. */
  rotate?: number
  /** 0..1 visible extent, as a circle centered on the animated element. */
  aperture?: number
}

export type TransitionContext = {
  index: number
  count: number
  /** The wedge's arc midpoint, degrees clockwise from 12 o'clock. */
  angle: number
  durationMs: number
  /** Which moment is being asked for, so a departure is authored, not reversed. */
  moment: Moment
}

export type TransitionFrames = {
  keyframes: PresentationKeyframe[]
  delayMs: number
  /** Absent means `easeOut`, the curve the entrance path has always run on. */
  easing?: EasingName
}

export type Transition = {
  id: TransitionId
  /** Structural. "Wedges fly in from outside", never "the big entrance". */
  name: string
  description: string
  scope: TransitionScope
  /** Which moments this transition serves. The editor offers it only for these. */
  moments: Moment[]
  defaults: TransitionParams
  fields: Field[]
  /** Pure. The only thing that affects what actually runs. */
  frames(params: TransitionParams, ctx: TransitionContext): TransitionFrames
}

export type TransitionInstance = { id: TransitionId; params: TransitionParams }

export type Moment = 'enter' | 'exit' | 'spin' | 'reveal'

export type Transitions = Partial<Record<Moment, TransitionInstance>>

/** Every value a transition animates, at one instant. */
export type Presence = {
  hold: number
  opacity: number
  scale: number
  offset: number
  /** Optional alone among these: absent means the wedge's own angle, and no number says that. */
  offsetAngle?: number
  rotate: number
  aperture: number
}
