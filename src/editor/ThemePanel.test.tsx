import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThemePanel } from './ThemePanel'
import { choose, optionsOf, picker } from './testing'

describe('ThemePanel', () => {
  it('offers every registered look', async () => {
    render(<ThemePanel theme={undefined} onChange={() => {}} />)
    expect(await optionsOf('Wheel')).toEqual(expect.arrayContaining(['Fortunate', 'Flat']))
  })

  it('reports the look that was picked', async () => {
    const onChange = vi.fn()
    render(<ThemePanel theme={undefined} onChange={onChange} />)
    await choose('Wheel', 'Fortunate')
    expect(onChange).toHaveBeenCalledWith('wof')
  })

  it('shows the flat look when a show names none', () => {
    render(<ThemePanel theme={undefined} onChange={() => {}} />)
    expect(picker('Wheel')).toHaveTextContent('Flat')
  })
})
