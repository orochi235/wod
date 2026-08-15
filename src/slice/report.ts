import { arcs } from '../wheel/geometry'
import type { Segment } from '../wheel/types'
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

/** What each wedge resolves to, for an operator to read before the wheel is on a screen. */
export function fitReport(
  segments: Segment[],
  wheelDefault: SliceInstance | undefined,
  radius: number,
  measure: Measure,
): FitRow[] {
  const fit = createFit(measure)
  const layout = arcs(segments)

  return segments.map((segment, index) => {
    const instance = resolveInstance(segment, wheelDefault)
    const authored = getSlice(instance.id)
    const arc = layout[index]
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
    const text = spelled[0]

    return {
      id: segment.id,
      label: segment.label,
      drawn: text?.text ?? null,
      size: text?.size ?? null,
      degraded: text === undefined || text.text !== segment.label,
    }
  })
}
