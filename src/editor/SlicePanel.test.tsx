import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlicePanel } from './SlicePanel'

describe('SlicePanel', () => {
  it('starts a chosen layout on its defaults', async () => {
    const onChange = vi.fn()
    render(<SlicePanel slice={undefined} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Layout'), 'curved')

    expect(onChange).toHaveBeenCalledWith({
      id: 'curved',
      params: expect.objectContaining({ frame: 'wheel' }),
    })
  })

  it("renders the chosen layout's own fields", () => {
    render(<SlicePanel slice={{ id: 'auto', params: {} }} onChange={vi.fn()} />)
    expect(screen.getByLabelText("When it won't fit")).toBeInTheDocument()
  })

  it('drops back to the built-in default when cleared', async () => {
    const onChange = vi.fn()
    render(<SlicePanel slice={{ id: 'curved', params: {} }} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Layout'), '')

    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('ignores a stored id that names no layout', () => {
    render(<SlicePanel slice={{ id: 'spiral' as never, params: {} }} onChange={vi.fn()} />)
    expect(screen.queryByLabelText("When it won't fit")).toBeNull()
  })
})
