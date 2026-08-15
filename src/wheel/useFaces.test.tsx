import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetFaces } from '../slice/fonts/load'
import { useFaces } from './useFaces'

const load = vi.fn(async (_spec: string) => [] as FontFace[])

beforeEach(() => {
  forgetFaces()
  load.mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 404 }) as Response),
  )
  Object.defineProperty(document, 'fonts', { value: { load }, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const face = (id: string, outline = false) => ({ id, family: id.toUpperCase(), outline })

describe('useFaces', () => {
  // The measurer sizes every wedge against whatever the fallback is until the
  // face itself lands, and it caches what it measured.
  it('asks the document for each face it is given', async () => {
    renderHook(() => useFaces([face('anton'), face('rye')]))

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(load.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining('ANTON'),
      expect.stringContaining('RYE'),
    ])
  })

  it('reports an arrival so the measurer can be retired', async () => {
    const { result } = renderHook(() => useFaces([face('anton')]))

    expect(result.current).toBe(0)
    await waitFor(() => expect(result.current).toBeGreaterThan(0))
  })

  it('asks nothing again when the same faces come round on a re-render', async () => {
    const { rerender } = renderHook(() => useFaces([face('anton')]))

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    rerender()
    rerender()
    expect(load).toHaveBeenCalledTimes(1)
  })

  // A parse is a fetch of the whole binary, so glyph mode must never pay for it.
  it('parses only the faces something wants warped', async () => {
    renderHook(() => useFaces([face('anton'), face('rye', true)]))

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/fonts/rye.ttf')
  })
})
