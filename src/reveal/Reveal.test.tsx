import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Segment } from '../wheel/types'
import { Reveal } from './Reveal'

const SEGMENT: Segment = { id: 'a', label: 'Alex', weight: 1 }

describe('Reveal', () => {
  it('falls back to the segment label when no headline is authored', () => {
    render(<Reveal segment={SEGMENT} reveal={{}} onDismiss={vi.fn()} />)
    expect(screen.getByRole('heading')).toHaveTextContent('Alex')
  })

  it('prefers the authored headline', () => {
    render(<Reveal segment={SEGMENT} reveal={{ headline: 'Free beer' }} onDismiss={vi.fn()} />)
    expect(screen.getByRole('heading')).toHaveTextContent('Free beer')
  })

  it('renders the body when there is one', () => {
    render(<Reveal segment={SEGMENT} reveal={{ body: 'on the house' }} onDismiss={vi.fn()} />)
    expect(screen.getByText('on the house')).toBeInTheDocument()
  })

  it('renders emoji media as text', () => {
    render(
      <Reveal
        segment={SEGMENT}
        reveal={{ media: { kind: 'emoji', value: '🍺' } }}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('🍺')).toBeInTheDocument()
  })

  it('renders image media as an img', () => {
    render(
      <Reveal
        segment={SEGMENT}
        reveal={{ media: { kind: 'image', value: 'https://example.test/x.png' } }}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByRole('presentation')).toHaveAttribute('src', 'https://example.test/x.png')
  })

  it('keeps the text when the media fails to load', () => {
    render(
      <Reveal
        segment={SEGMENT}
        reveal={{ headline: 'Free beer', media: { kind: 'gif', value: 'bad://x' } }}
        onDismiss={vi.fn()}
      />,
    )
    fireEvent.error(screen.getByRole('presentation'))
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
    expect(screen.getByRole('heading')).toHaveTextContent('Free beer')
  })

  it('dismisses on click', async () => {
    const onDismiss = vi.fn()
    render(<Reveal segment={SEGMENT} reveal={{ headline: 'Hi' }} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('dialog'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses on Escape', async () => {
    const onDismiss = vi.fn()
    render(<Reveal segment={SEGMENT} reveal={{ headline: 'Hi' }} onDismiss={onDismiss} />)
    await userEvent.keyboard('{Escape}')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('takes focus so the keyboard reaches it', () => {
    render(<Reveal segment={SEGMENT} reveal={{ headline: 'Hi' }} onDismiss={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveFocus()
  })
})
