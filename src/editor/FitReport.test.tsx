import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Measure } from '../slice/types'
import { FitReport } from './FitReport'

/** Linear and deterministic, so a row's outcome is arithmetic rather than a font. */
const measure: Measure = (text, size) => text.length * 0.5 * size

describe('FitReport', () => {
  it('names what each wedge will draw', () => {
    render(
      <FitReport
        segments={[
          { id: 'a', label: 'Sleve McDichael', weight: 1 },
          { id: 'b', label: 'Onson Sweemey', weight: 1 },
        ]}
        slice={undefined}
        measure={measure}
      />,
    )
    expect(screen.getAllByText('Sleve McDichael')).toHaveLength(2)
    expect(screen.getAllByText('Onson Sweemey')).toHaveLength(2)
  })

  it('says so when a wedge draws no label', () => {
    render(
      <FitReport
        segments={[
          { id: 'a', label: 'Raul Chamgerlain', weight: 0.00001 },
          { id: 'b', label: 'Kevin Nogilny', weight: 100 },
        ]}
        slice={undefined}
        measure={measure}
      />,
    )
    expect(screen.getByText('no label')).toBeInTheDocument()
  })
})
