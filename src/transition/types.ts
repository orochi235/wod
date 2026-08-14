import type { Field } from '../form/fields'

export type TransitionId = 'fade' | 'fly'

export type TransitionParams = Record<string, unknown>

export type TransitionScope = 'wedge' | 'wheel'

export type PresentationKeyframe = {
  /** Position within the transition's own duration, 0..1. */
  at: number
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
}

export type TransitionFrames = {
  keyframes: PresentationKeyframe[]
  delayMs: number
}

export type Transition = {
  id: TransitionId
  /** Structural. "Wedges fly in from outside", never "the big entrance". */
  name: string
  description: string
  scope: TransitionScope
  defaults: TransitionParams
  fields: Field[]
  /** Pure. The only thing that affects what actually runs. */
  frames(params: TransitionParams, ctx: TransitionContext): TransitionFrames
}

export type TransitionInstance = { id: TransitionId; params: TransitionParams }

export type Moment = 'enter' | 'exit' | 'spin' | 'reveal'

export type Transitions = Partial<Record<Moment, TransitionInstance>>
