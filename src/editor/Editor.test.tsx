import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Editor } from './Editor'

describe('Editor', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the three columns', () => {
    render(<Editor />)
    expect(screen.getByRole('heading', { name: /segments/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /tricks/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'wheel' })).toBeInTheDocument()
  })

  it('offers a way back to the show page', () => {
    render(<Editor />)
    expect(screen.getByRole('link', { name: /show/i })).toHaveAttribute('href', '#/')
  })
})
