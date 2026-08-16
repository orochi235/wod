import { arcs } from '../wheel/geometry'
import type { Segment } from '../wheel/types'
import type { Breakpoint } from './breakpoints'
import { createFit } from './fit'
import { getSlice, resolveInstance } from './registry'
import type { Measure, SliceInstance } from './types'

export type FitRow = {
  id: string
  label: string
  /** What the wedge will draw, or null when it draws no text at all. */
  drawn: string | null
  size: number | null
  /** The label is not being shown as authored. */
  degraded: boolean
}

const letters = (text: string): string => text.replace(/\s+/g, '').toUpperCase()

/** What each wedge resolves to, for an operator to read before the wheel is on a screen. */
export function fitReport(
  segments: Segment[],
  wheelDefault: SliceInstance | undefined,
  radius: number,
  measure: Measure,
  breakpoints?: Breakpoint[],
): FitRow[] {
  const fit = createFit(measure)
  const layout = arcs(segments)

  return segments.map((segment, index) => {
    const arc = layout[index]
    const instance = resolveInstance(segment, wheelDefault, breakpoints, arc.end - arc.start)
    const authored = getSlice(instance.id)
    const elements = authored
      ? authored.draw(instance.params, {
          segment,
          arc: { start: arc.start, end: arc.end },
          radius,
          index,
          count: segments.length,
          measure,
          fit,
        })
      : []

    const spelled = elements.flatMap((element) => {
      if (element.kind === 'text' || element.kind === 'curvedText') {
        return [{ text: element.text, size: element.size }]
      }
      if (element.kind === 'glyphRun' && element.glyphs.length > 0) {
        return [
          {
            text: element.glyphs.map((glyph) => glyph.char).join(''),
            size: element.glyphs[0].size,
          },
        ]
      }
      return []
    })
    // Every part, not the first: a composition can split a name across two, and
    // reporting one of them would read as a wedge that shortened it.
    const drawn = spelled.length > 0 ? spelled.map((entry) => entry.text).join(' ') : null

    return {
      id: segment.id,
      label: segment.label,
      drawn,
      size: spelled[0]?.size ?? null,
      // Letters, not spelling: a part may set its share in capitals, and where
      // the composition broke the name is not the operator's problem.
      degraded: drawn === null || letters(drawn) !== letters(segment.label),
    }
  })
}
