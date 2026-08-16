import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRESET } from '../preset/defaults'
import { getSample } from '../preset/samples'
import { PresetIo } from './PresetIo'

describe('PresetIo', () => {
  it('offers a download link carrying the preset as JSON', () => {
    render(<PresetIo preset={DEFAULT_PRESET} onImport={vi.fn()} showExport={true} />)
    const link = screen.getByRole('link', { name: /export/i })
    expect(link).toHaveAttribute('download', 'wod-standup.json')
    expect(link.getAttribute('href')).toContain('application/json')
  })

  it('drops the download link, but not import, when export is withheld', () => {
    render(<PresetIo preset={DEFAULT_PRESET} onImport={vi.fn()} showExport={false} />)
    expect(screen.queryByRole('link', { name: /export/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/import/i)).toBeInTheDocument()
  })

  it('imports a valid file through the defensive parser', async () => {
    const onImport = vi.fn()
    render(<PresetIo preset={DEFAULT_PRESET} onImport={onImport} showExport={true} />)
    const file = new File([JSON.stringify({ ...DEFAULT_PRESET, name: 'beer' })], 'p.json', {
      type: 'application/json',
    })
    await userEvent.upload(screen.getByLabelText(/import/i), file)
    await waitFor(() => expect(onImport).toHaveBeenCalled())
    expect(onImport.mock.calls[0][0].name).toBe('beer')
  })

  it('falls back to the default rather than throwing on a malformed file', async () => {
    const onImport = vi.fn()
    render(<PresetIo preset={DEFAULT_PRESET} onImport={onImport} showExport={true} />)
    const file = new File(['{not json'], 'p.json', { type: 'application/json' })
    await userEvent.upload(screen.getByLabelText(/import/i), file)
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(DEFAULT_PRESET))
  })

  it('loads a sample, and hands over a copy of it', async () => {
    const onImport = vi.fn()
    render(<PresetIo preset={DEFAULT_PRESET} onImport={onImport} showExport={true} />)

    await userEvent.selectOptions(screen.getByLabelText(/sample/i), 'cash-wheel')

    const loaded = onImport.mock.calls[0][0]
    expect(loaded.name).toBe('cash wheel')
    expect(loaded.segments).toHaveLength(24)
    // The module's own object would be edited in place by whatever comes next.
    expect(loaded).not.toBe(getSample('cash-wheel')?.preset)
  })

  it('comes back to the placeholder, so the select never names the live wheel', async () => {
    render(<PresetIo preset={DEFAULT_PRESET} onImport={vi.fn()} showExport={true} />)
    const select = screen.getByLabelText(/sample/i)

    await userEvent.selectOptions(select, 'cash-wheel')

    expect(select).toHaveValue('')
  })
})
