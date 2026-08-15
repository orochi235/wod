import type { ReactNode } from 'react'
import type { Field } from '../form/fields'
import type { Segment } from '../wheel/types'

/** Whether a drawn element's orientation rides the rotor or stays level. */
export type Frame = 'wheel' | 'level'

/**
 * The first three place one element through `fit`. The last three are set glyph
 * by glyph and emit a `glyphRun`.
 */
export type Orientation =
  | 'radial'
  | 'tangential'
  | 'curved'
  | 'stacked'
  | 'taperedRadial'
  | 'archedRim'

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

/**
 * One character, already placed. Wheel-local user units, with the wedge's own
 * rotation baked in: the renderer writes the transform and decides nothing.
 */
export type Glyph = {
  char: string
  x: number
  y: number
  size: number
  /** Degrees, clockwise, applied at (x, y). */
  rotate: number
  /** The glyph's own axes, after `rotate`. Stretch lives here. */
  scale: [number, number]
}

type Drawn =
  | { kind: 'text'; text: string; along: 'radial' | 'tangential'; anchor: number; size: number }
  | { kind: 'curvedText'; text: string; anchor: number; size: number }
  | { kind: 'glyphRun'; glyphs: Glyph[] }
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

/**
 * A validated string, never a union: a couple of dozen ids in a union type is a
 * merge conflict waiting to happen, and an unknown id resolves to a default
 * rather than failing to compile. The registry that validates it is a later
 * plan's; nothing reads this field yet.
 */
export type FontId = string

export type PartContent =
  | { from: 'label'; transform?: ContentTransform }
  | { from: 'text'; value: string }
  | { from: 'media' }
  | { from: 'derived'; value: 'weight' | 'index' | 'position' }

export type SlicePart = {
  content: PartContent
  orientation: Orientation
  /** Inner and outer edge, as fractions of the radius. */
  band: [number, number]
  /** Default 'rimInward'. */
  direction?: 'rimInward' | 'hubOutward'
  /** Letters keep their relative growth toward the rim. Default on, and moot on an arc. */
  fan?: boolean
  /** Widen each glyph to the room at its radius. Default 'none'. */
  stretch?: 'none' | 'fill' | number
  /** How the run is drawn. Default 'glyphs'. Only 'glyphs' is implemented. */
  shape?: 'glyphs' | 'outline'
  /** A registry id. Absent means the theme's default face. Not yet read. */
  font?: FontId
  maxSize?: number
  frame?: Frame
}
