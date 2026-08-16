import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Banner } from './Banner'

describe('Banner', () => {
  it('names the winner for anything that cannot see the type', () => {
    render(<Banner label="Karrillo" onDismiss={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'Karrillo' })).toBeInTheDocument()
  })

  it('dismisses on a click', async () => {
    const onDismiss = vi.fn()
    render(<Banner label="Karrillo" onDismiss={onDismiss} />)

    await userEvent.click(screen.getByRole('dialog'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses on Escape', async () => {
    const onDismiss = vi.fn()
    render(<Banner label="Karrillo" onDismiss={onDismiss} />)

    await userEvent.keyboard('{Escape}')

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
