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

export type ContentTransform =
  | 'full'
  | 'firstName'
  | 'lastName'
  | 'initials'
  | 'digits'
  | 'ellipsis'

export type SliceLayoutId = 'auto' | 'radial' | 'tangential' | 'curved' | 'composed' | 'cash'

export type SliceParams = Record<string, unknown>

/**
 * Advance width of `text` at `size`, in user units. Linear in `size`. The family
 * is a CSS family name, not a registry id: the measurer measures what the face
 * paints, and a part in one face measures nothing like the same string in another.
 */
export type Measure = (text: string, size: number, family?: string) => number

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
  /** The CSS family the text is set in. Absent measures the default face. */
  family?: string
  /**
   * Extra advance per character, as a fraction of the size. It enters the solve
   * rather than only the paint: a run tracked wider than it was sized for
   * overflows the box the solve just proved it fit in.
   */
  tracking?: number
  /** The line box, as a multiple of the size. */
  leading?: number
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

/**
 * A solved run before it is drawn as anything. Glyph mode turns it into `Glyph`s
 * and outline mode warps the same numbers, so switching `shape` reflows nothing.
 */
export type PlacedGlyph = {
  char: string
  size: number
  /**
   * Radial: the radius the glyph's centre sits at. Arc: how far along the
   * baseline that centre is from the run's middle, signed.
   */
  along: number
  /** The factor on the axis that crosses the wedge — stretch and condense. */
  factor: number
  /** Measured at size 1, in the face the run is set in. */
  advance: number
}

export type RunFrame =
  | { kind: 'radial'; mid: number; upright: boolean; inward: boolean }
  | { kind: 'arc'; mid: number; baseline: number }

export type PlacedRun = { frame: RunFrame; glyphs: PlacedGlyph[] }

/** A flattened glyph contour at size 1: x from the glyph origin along its
 * baseline, y up from it. Curves are already subdivided — a non-affine warp
 * moves the points themselves, so there is nothing left for a curve to mean. */
export type Contour = [number, number][]

/**
 * Where outline mode gets its geometry. Synchronous by construction: `draw` is
 * pure, so the parse has to have happened before the wedge is drawn.
 */
export type GlyphSource = {
  /** Null for a character the face does not carry. */
  contours(char: string): Contour[] | null
  advance(char: string): number
  /** How far above the baseline the glyph's centre line sits, at size 1. */
  centre: number
}

type Drawn =
  | {
      kind: 'text'
      text: string
      along: 'radial' | 'tangential'
      anchor: number
      size: number
      /** User units, already multiplied out of the part's tracking. */
      letterSpacing?: number
    }
  | { kind: 'curvedText'; text: string; anchor: number; size: number; letterSpacing?: number }
  | { kind: 'glyphRun'; glyphs: Glyph[] }
  | { kind: 'image'; href: string; anchor: number; size: number; clip?: 'circle' | 'wedge' }
  | { kind: 'path'; d: string; fill?: string; opacity?: number }
  | { kind: 'raw'; node: ReactNode }

/**
 * `frame` overrides the layout's own, so a portrait can ride while its caption
 * stays level. A level element must be centered on its own origin: the
 * counter-rotation resolves its origin from the element's bounding box.
 *
 * `family` is a CSS family, already resolved, and painting an element in
 * anything else mis-sizes it: every size on it was measured in that face.
 */
export type SliceElement = Drawn & { frame?: Frame; family?: string; ink?: string }

export type SliceContext = {
  segment: Segment
  /** Turns. 0 is 12 o'clock, increasing clockwise. */
  arc: { start: number; end: number }
  radius: number
  index: number
  count: number
  measure: Measure
  fit: (spec: FitSpec) => Placement | null
  /** The look's default face. A part's own `font` overrides it. */
  font?: FontId
  /**
   * A parsed face, or null while one is still arriving — which is why a part in
   * outline mode draws in glyph mode until then.
   */
  outlines?: (font: FontId | undefined) => GlyphSource | null
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
 * merge conflict waiting to happen, and an unknown id resolves to the default
 * face rather than failing to compile. `slice/fonts/registry.ts` validates it.
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
  /**
   * Grow each glyph across the wedge to the room at its radius. Default 'none'.
   * Across, never "wider": a quarter-turned run crosses the wedge with its
   * height, so this is the glyph's y axis there and its x axis everywhere else.
   */
  stretch?: 'none' | 'fill' | number
  /** How a glyph the chord cannot hold gives way, on that same axis. Default 'proportional'. */
  shrink?: 'proportional' | 'condense'
  /** Set the resolved content in capitals, whatever case it arrived in. */
  caps?: boolean
  /** How the run is drawn. Default 'glyphs'. Only 'glyphs' is implemented. */
  shape?: 'glyphs' | 'outline'
  /** A registry id. Absent means the theme's default face. */
  font?: FontId
  maxSize?: number
  frame?: Frame
  /** `#rgb` or `#rrggbb`. Absent takes the wedge's own label ink. */
  color?: string
  /** Extra advance per character, as a fraction of the size. Default 0.08. */
  tracking?: number
  /** The line box, as a multiple of the size. Default 1.2. */
  leading?: number
}
