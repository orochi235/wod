import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemePanel } from './ThemePanel'

describe('ThemePanel', () => {
  it('offers every registered look', () => {
    render(<ThemePanel theme={undefined} onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'Wheel of Fortune' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Flat' })).toBeInTheDocument()
  })

  it('reports the look that was picked', async () => {
    const onChange = vi.fn()
    render(<ThemePanel theme={undefined} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'wof')
    expect(onChange).toHaveBeenCalledWith('wof')
  })

  it('shows the flat look when a show names none', () => {
    render(<ThemePanel theme={undefined} onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveValue('flat')
  })
})
