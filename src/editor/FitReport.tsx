import { PropertyPanel } from '@weasel-js/labkit'
import { useMemo } from 'react'
import type { Breakpoint } from '../slice/breakpoints'
import { createMeasure } from '../slice/measure'
import { fitReport } from '../slice/report'
import type { Measure, SliceInstance } from '../slice/types'
import type { Segment } from '../wheel/types'

export type FitReportProps = {
  segments: Segment[]
  slice: SliceInstance | undefined
  breakpoints?: Breakpoint[]
  radius?: number
  /** The wheel measures with canvas metrics; a caller may supply its own. */
  measure?: Measure
}

export function FitReport({ segments, slice, breakpoints, radius = 200, measure }: FitReportProps) {
  const fallback = useMemo(() => createMeasure(), [])
  const rows = fitReport(segments, slice, radius, measure ?? fallback, breakpoints)

  return (
    <PropertyPanel title="Fit report" className="editor__center-panel">
      <ul className="fit-report">
        {rows.map((row) => (
          <li
            className={`fit-report__row${row.degraded ? ' fit-report__row--degraded' : ''}`}
            key={row.id}
          >
            <span className="fit-report__label">{row.label}</span>
            <span className="fit-report__drawn">{row.drawn ?? 'no label'}</span>
          </li>
        ))}
      </ul>
    </PropertyPanel>
  )
}
