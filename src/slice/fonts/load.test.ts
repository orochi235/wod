import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetFaces, requestFace, sourceFor } from './load'

const glyph = (index: number, commands: { type: string; [key: string]: unknown }[]) => ({
  index,
  advanceWidth: 1024,
  getPath: () => ({ commands }),
})

const font = {
  unitsPerEm: 2048,
  ascender: 1600,
  descender: -400,
  charToGlyph: vi.fn((char: string) =>
    char === '😀'
      ? glyph(0, [])
      : glyph(7, [
          { type: 'M', x: 0, y: 0 },
          { type: 'Q', x1: 0.5, y1: -1, x: 1, y: 0 },
          { type: 'Z' },
        ]),
  ),
}

vi.mock('opentype.js', () => ({ parse: vi.fn(() => font) }))

const ok = () =>
  vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as Response)

beforeEach(() => {
  forgetFaces()
  font.charToGlyph.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestFace', () => {
  it('fetches and parses a face once, however many ask', async () => {
    const fetched = ok()
    vi.stubGlobal('fetch', fetched)

    const [first, second] = await Promise.all([requestFace('anton'), requestFace('anton')])
    expect(fetched).toHaveBeenCalledTimes(1)
    expect(fetched).toHaveBeenCalledWith('/fonts/anton.ttf')
    expect(first).toBe(second)
  })

  it('reads the face for an id no build carries as no face at all', async () => {
    vi.stubGlobal('fetch', ok())
    expect(await requestFace('made-up')).toBeNull()
  })

  // The part was drawing in glyph mode while the face was on its way, and that
  // is what it keeps doing. Retrying every render would be a fetch per frame.
  it('settles a face that will not load as null, and does not ask again', async () => {
    const failing = vi.fn(async () => ({ ok: false, status: 404 }) as Response)
    vi.stubGlobal('fetch', failing)

    expect(await requestFace('rye')).toBeNull()
    expect(await requestFace('rye')).toBeNull()
    expect(failing).toHaveBeenCalledTimes(1)
  })
})

describe('sourceFor', () => {
  it('is null until the parse lands', async () => {
    vi.stubGlobal('fetch', ok())

    const pending = requestFace('bevan')
    expect(sourceFor('bevan')).toBeNull()
    await pending
    expect(sourceFor('bevan')).not.toBeNull()
  })

  it('flattens a curve into points a warp can move', async () => {
    vi.stubGlobal('fetch', ok())
    const source = await requestFace('bevan')
    const [contour] = source?.contours('W') ?? []

    expect(contour).toHaveLength(9)
    expect(contour[0]).toEqual([0, 0])
    expect(contour.at(-1)).toEqual([1, 0])
    // The middle of a quadratic, which no line segment would have reached.
    expect(contour[4][1]).toBeCloseTo(-0.5, 5)
  })

  it('flattens each character once', async () => {
    vi.stubGlobal('fetch', ok())
    const source = await requestFace('bevan')
    source?.contours('W')
    source?.contours('W')

    expect(font.charToGlyph).toHaveBeenCalledTimes(1)
  })

  it('reports a character the face does not carry', async () => {
    vi.stubGlobal('fetch', ok())
    const source = await requestFace('bevan')

    expect(source?.contours('😀')).toBeNull()
  })

  it('reads the metrics a warp centres a glyph with', async () => {
    vi.stubGlobal('fetch', ok())
    const source = await requestFace('bevan')

    expect(source?.centre).toBeCloseTo((1600 - 400) / (2 * 2048), 9)
    expect(source?.advance('W')).toBeCloseTo(0.5, 9)
  })
})
