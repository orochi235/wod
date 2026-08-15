import type { ReactNode } from 'react'
import type { Field } from '../form/fields'
import type { Segment } from '../wheel/types'

/** Whether a drawn element's orientation rides the rotor or stays level. */
export type Frame = 'wheel' | 'level'

export type Orientation = 'radial' | 'tangential' | 'curved'

export type ContentTransform = 'full' | 'firstName' | 'initials' | 'ellipsis'

export type SliceLayoutId = 'auto' | 'radial' | 'tangential' | 'curved'

export type SliceParams = Record<string, unknown>

/** Advance width of `text` at `size`, in user units. Linear in `size`. */
export type Measure = (text: string, size: number) => number

export type FitSpec = {
  text: string
  orientation: Orientation
  frame: Frame
  /** The wedge's arc, in turns. */
  width: number
  radius: number
  /** Fraction of the radius the text sits at. */
  anchor: number
  maxSize: number
  minSize: number
}

export type Placement = {
  orientation: Orientation
  anchor: number
  size: number
  text: string
}

type Drawn =
  | { kind: 'text'; text: string; along: 'radial' | 'tangential'; anchor: number; size: number }
  | { kind: 'curvedText'; text: string; anchor: number; size: number }
  | { kind: 'image'; href: string; anchor: number; size: number; clip?: 'circle' | 'wedge' }
  | { kind: 'path'; d: string; fill?: string; opacity?: number }
  | { kind: 'raw'; node: ReactNode }

/**
 * `frame` overrides the layout's own, so a portrait can ride while its caption
 * stays level. A level element must be centered on its own origin: the
 * counter-rotation resolves its origin from the element's bounding box.
 */
export type SliceElement = Drawn & { frame?: Frame }

export type SliceContext = {
  segment: Segment
  /** Turns. 0 is 12 o'clock, increasing clockwise. */
  arc: { start: number; end: number }
  radius: number
  index: number
  count: number
  measure: Measure
  fit: (spec: FitSpec) => Placement | null
}

export type SliceLayout = {
  id: SliceLayoutId
  /** Structural. "Text curves along the arc", never "the fancy one". */
  name: string
  description: string
  defaults: SliceParams
  fields: Field[]
  /** Pure. The only thing that affects what gets drawn. */
  draw(params: SliceParams, ctx: SliceContext): SliceElement[]
}

export type SliceInstance = { id: SliceLayoutId; params: SliceParams }
