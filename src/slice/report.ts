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

    const text = elements.find(
      (element) => element.kind === 'text' || element.kind === 'curvedText',
    ) as { text: string; size: number } | undefined

    return {
      id: segment.id,
      label: segment.label,
      drawn: text?.text ?? null,
      size: text?.size ?? null,
      degraded: text === undefined || text.text !== segment.label,
    }
  })
}
