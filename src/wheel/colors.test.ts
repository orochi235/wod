import { describe, expect, it } from 'vitest'
import type { Origin } from '../compose/types'
import { assignColors } from './colors'
import { DEFAULT_PALETTE } from './palette'
import type { Segment } from './types'

const segment = (id: string, color?: string): Segment =>
  color === undefined ? { id, label: id, weight: 1 } : { id, label: id, weight: 1, color }

const NO_ORIGINS = new Map<string, Origin>()
const fresh = { previous: new Map<string, string>(), retained: new Set<string>() }

describe('assignColors', () => {
  it('leaves an authored color alone', () => {
    const { segments } = assignColors([segment('beer', '#ffd166')], NO_ORIGINS, fresh)
    expect(segments[0].color).toBe('#ffd166')
  })

  it('gives every uncolored wedge a distinct swatch', () => {
    const { segments } = assignColors(
      [segment('ana'), segment('ben'), segment('cy')],
      NO_ORIGINS,
      fresh,
    )
    const fills = segments.map((s) => s.color)
    expect(new Set(fills).size).toBe(3)
    for (const fill of fills) expect(DEFAULT_PALETTE).toContain(fill)
  })

  it('keeps a wedge on its swatch when a neighbor leaves', () => {
    const first = assignColors([segment('ana'), segment('ben'), segment('cy')], NO_ORIGINS, fresh)
    const before = first.segments.find((s) => s.id === 'cy')?.color

    const second = assignColors([segment('ana'), segment('cy')], NO_ORIGINS, {
      previous: first.colors,
      retained: new Set<string>(),
    })
    expect(second.segments.find((s) => s.id === 'cy')?.color).toBe(before)
  })

  it('does not hand an arrival the swatch of a wedge still exiting', () => {
    const first = assignColors([segment('ana'), segment('ben')], NO_ORIGINS, fresh)
    const bens = first.segments.find((s) => s.id === 'ben')?.color

    // 'ben' has left the roster but is still being drawn.
    const second = assignColors([segment('ana'), segment('dan')], NO_ORIGINS, {
      previous: first.colors,
      retained: new Set(['ben']),
    })
    expect(second.segments.find((s) => s.id === 'dan')?.color).not.toBe(bens)
  })

  it('releases a swatch once the wedge is neither present nor retained', () => {
    const first = assignColors([segment('ana'), segment('ben')], NO_ORIGINS, fresh)
    const second = assignColors([segment('ana')], NO_ORIGINS, {
      previous: first.colors,
      retained: new Set<string>(),
    })
    expect(second.colors.has('ben')).toBe(false)
  })

  it('does not duplicate an authored color with a palette pick', () => {
    const authored = DEFAULT_PALETTE[0]
    const { segments } = assignColors(
      [segment('beer', authored), segment('ana')],
      NO_ORIGINS,
      fresh,
    )
    expect(segments[1].color).not.toBe(authored)
  })

  it('falls back to the wrapping palette when every swatch is taken', () => {
    const many = DEFAULT_PALETTE.map((_, i) => segment(`w${i}`))
    const { segments } = assignColors([...many, segment('extra')], NO_ORIGINS, fresh)
    expect(segments[segments.length - 1].color).toBe(DEFAULT_PALETTE[0])
  })

  it('does not mutate the previous map', () => {
    const previous = new Map<string, string>([
      ['ana', DEFAULT_PALETTE[0]],
      ['ben', DEFAULT_PALETTE[1]],
    ])
    const snapshot = new Map(previous)
    assignColors([segment('ana'), segment('cy')], NO_ORIGINS, {
      previous,
      retained: new Set<string>(),
      choose: (s) => (s.id === 'ana' ? '#123456' : undefined),
    })
    expect(previous).toEqual(snapshot)
  })

  it('drops a sticky color a later wedge authors this pass', () => {
    const first = assignColors([segment('ana')], NO_ORIGINS, fresh)
    const anas = first.segments[0].color

    const second = assignColors([segment('ana'), segment('beer', anas as string)], NO_ORIGINS, {
      previous: first.colors,
      retained: new Set<string>(),
    })
    expect(second.segments.find((s) => s.id === 'ana')?.color).not.toBe(
      second.segments.find((s) => s.id === 'beer')?.color,
    )
  })

  it('keeps an exiting wedge reserved when another wedge briefly authors its color', () => {
    const first = assignColors([segment('ana'), segment('ben')], NO_ORIGINS, fresh)
    const bens = first.segments.find((s) => s.id === 'ben')?.color as string

    const second = assignColors([segment('ana'), segment('beer', bens)], NO_ORIGINS, {
      previous: first.colors,
      retained: new Set(['ben']),
    })

    const third = assignColors([segment('ana'), segment('cy')], NO_ORIGINS, {
      previous: second.colors,
      retained: new Set(['ben']),
    })
    expect(third.segments.find((s) => s.id === 'cy')?.color).not.toBe(bens)
  })
})

describe('assignColors choose', () => {
  const origins = new Map<string, Origin>([
    ['sim:ana', { kind: 'external', feedId: 'sim', itemId: 'ana' }],
  ])

  it('uses the callback for an uncolored wedge', () => {
    const { segments } = assignColors([segment('ana')], NO_ORIGINS, {
      ...fresh,
      choose: () => '#123456',
    })
    expect(segments[0].color).toBe('#123456')
  })

  it('does not let the callback override an authored color', () => {
    const { segments } = assignColors([segment('beer', '#ffd166')], NO_ORIGINS, {
      ...fresh,
      choose: () => '#123456',
    })
    expect(segments[0].color).toBe('#ffd166')
  })

  it('falls through to the palette when the callback returns undefined', () => {
    const { segments } = assignColors([segment('ana')], NO_ORIGINS, {
      ...fresh,
      choose: () => undefined,
    })
    expect(DEFAULT_PALETTE).toContain(segments[0].color)
  })

  it('does not duplicate a chosen color with a palette pick', () => {
    const { segments } = assignColors([segment('ana'), segment('ben')], NO_ORIGINS, {
      ...fresh,
      choose: (s) => (s.id === 'ana' ? DEFAULT_PALETTE[0] : undefined),
    })
    expect(segments[1].color).not.toBe(DEFAULT_PALETTE[0])
  })

  it('lets the callback see a color authored on a later wedge', () => {
    const authored = DEFAULT_PALETTE[0]
    const { segments } = assignColors([segment('ana'), segment('beer', authored)], NO_ORIGINS, {
      ...fresh,
      choose: (_s, ctx) => DEFAULT_PALETTE.find((c) => !ctx.taken.has(c)),
    })
    expect(segments[0].color).not.toBe(segments[1].color)
  })

  it('releases the sticky entry when a chosen color replaces it', () => {
    const first = assignColors([segment('ana')], NO_ORIGINS, fresh)
    const second = assignColors([segment('ana')], NO_ORIGINS, {
      previous: first.colors,
      retained: new Set<string>(),
      choose: () => '#123456',
    })
    expect(second.colors.has('ana')).toBe(false)
  })

  it('does not store a chosen color, so it can change', () => {
    const first = assignColors([segment('ana')], NO_ORIGINS, { ...fresh, choose: () => '#111111' })
    const second = assignColors([segment('ana')], NO_ORIGINS, {
      previous: first.colors,
      retained: new Set<string>(),
      choose: () => '#222222',
    })
    expect(second.segments[0].color).toBe('#222222')
  })

  it('passes the wedge origin to the callback', () => {
    let seen: Origin | undefined
    assignColors([segment('sim:ana')], origins, {
      ...fresh,
      choose: (_s, ctx) => {
        seen = ctx.origin
        return undefined
      },
    })
    expect(seen).toEqual({ kind: 'external', feedId: 'sim', itemId: 'ana' })
  })

  it('passes index and count to the callback', () => {
    const seen: Array<[number, number]> = []
    assignColors([segment('ana'), segment('ben')], NO_ORIGINS, {
      ...fresh,
      choose: (_s, ctx) => {
        seen.push([ctx.index, ctx.count])
        return undefined
      },
    })
    expect(seen).toEqual([
      [0, 2],
      [1, 2],
    ])
  })
})
