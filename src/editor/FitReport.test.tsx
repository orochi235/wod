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
    // Twice each: the roster label, and what the wedge draws it as.
    expect(screen.getByText('Sleve McDichael')).toBeInTheDocument()
    expect(screen.getByText('Sleve MCDICHAEL')).toBeInTheDocument()
    expect(screen.getByText('Onson Sweemey')).toBeInTheDocument()
    expect(screen.getByText('Onson SWEEMEY')).toBeInTheDocument()
  })

  it('says so when a wedge draws no label', () => {
    render(
      <FitReport
        segments={[
          { id: 'a', label: 'Raul Chamgerlain', weight: 0.00001 },
          { id: 'b', label: 'Kevin Nogilny', weight: 100 },
        ]}
        // Giving up on a label is `auto`'s, not the built-in default's.
        slice={{ id: 'auto', params: {} }}
        measure={measure}
      />,
    )
    expect(screen.getByText('no label')).toBeInTheDocument()
  })
})
