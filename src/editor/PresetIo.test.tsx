import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRESET } from '../preset/defaults'
import { PresetIo } from './PresetIo'

describe('PresetIo', () => {
  it('offers a download link carrying the preset as JSON', () => {
    render(<PresetIo preset={DEFAULT_PRESET} onImport={vi.fn()} />)
    const link = screen.getByRole('link', { name: /export/i })
    expect(link).toHaveAttribute('download', 'wod-standup.json')
    expect(link.getAttribute('href')).toContain('application/json')
  })

  it('imports a valid file through the defensive parser', async () => {
    const onImport = vi.fn()
    render(<PresetIo preset={DEFAULT_PRESET} onImport={onImport} />)
    const file = new File([JSON.stringify({ ...DEFAULT_PRESET, name: 'beer' })], 'p.json', {
      type: 'application/json',
    })
    await userEvent.upload(screen.getByLabelText(/import/i), file)
    await waitFor(() => expect(onImport).toHaveBeenCalled())
    expect(onImport.mock.calls[0][0].name).toBe('beer')
  })

  it('falls back to the default rather than throwing on a malformed file', async () => {
    const onImport = vi.fn()
    render(<PresetIo preset={DEFAULT_PRESET} onImport={onImport} />)
    const file = new File(['{not json'], 'p.json', { type: 'application/json' })
    await userEvent.upload(screen.getByLabelText(/import/i), file)
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(DEFAULT_PRESET))
  })
})
