import { act, renderHook } from '@testing-library/react'
import { type FireHandle, type FireOptions, LIGHTING_NAMES, LOOK_NAMES, type TextRun } from 'klieg'
import { describe, expect, it } from 'vitest'
import type { Landing } from '../wheel/useSpin'
import { type CreateBanner, useBanner } from './useBanner'

const spelled = (text: string | TextRun[]): string =>
  typeof text === 'string' ? text : text.map((run) => run.text).join('')

type Fire = { text: string; options: FireOptions }

/** klieg's fire returns a promise carrying the dismissing press; the stub never holds. */
const handle = (settled: Promise<void>): FireHandle =>
  Object.assign(settled, { advance: () => undefined })

/** A klieg that records what it was asked to draw instead of drawing it. */
function stage(options: { supported?: boolean; fails?: boolean } = {}) {
  const fires: Fire[] = []
  let destroyed = 0
  const create: CreateBanner = () => ({
    supported: options.supported ?? true,
    fire(text, fireOptions = {}) {
      fires.push({ text: spelled(text), options: fireOptions })
      return handle(options.fails ? Promise.reject(new Error('no font')) : Promise.resolve())
    },
    warm: () => Promise.resolve(),
    preheat: () => Promise.resolve(),
    destroy() {
      destroyed += 1
    },
  })
  return {
    create,
    fires,
    destroys: () => destroyed,
    /** How the word arrived, or null if it never did. */
    arrival: () => fires.find((fire) => fire.options.enter !== 'none') ?? null,
    exits: () => fires.filter((fire) => fire.options.enter === 'none'),
  }
}

const landing = (id: number, label = 'Solo'): Landing => ({
  id,
  winner: { id: 'solo', label, weight: 1 },
})

const mount = (bk: ReturnType<typeof stage>, first: Landing | null = null) =>
  renderHook(
    ({ at }: { at: Landing | null }) =>
      useBanner(at, { fontUrl: '/fonts/bevan.ttf', create: bk.create }),
    {
      initialProps: { at: first },
    },
  )

describe('useBanner', () => {
  it('spells the winner out when the wheel stops', () => {
    const bk = stage()
    const { result, rerender } = mount(bk)
    expect(result.current.shown).toBeNull()

    rerender({ at: landing(1, 'Karrillo') })

    expect(result.current.shown).toBe('Karrillo')
    expect(bk.arrival()?.text).toBe('Karrillo')
  })

  it('leaves the word up rather than timing it out', () => {
    const bk = stage()
    const { result, rerender } = mount(bk, landing(1))

    for (let n = 0; n < 5; n++) rerender({ at: landing(1) })

    expect(result.current.shown).toBe('Solo')
    // One fire, and a hold no meeting outlasts: the click is the only way out.
    expect(bk.fires).toHaveLength(1)
    expect(bk.arrival()?.options.hold).toBeGreaterThan(60_000)
    expect(bk.arrival()?.options.exit).toBe('none')
  })

  it('plays the word off when it is dismissed', () => {
    const bk = stage()
    const { result, rerender } = mount(bk, landing(1))

    act(() => result.current.dismiss())

    expect(result.current.shown).toBeNull()
    expect(bk.exits()).toHaveLength(1)
    // Same word, no entrance and no hold, so the replacement reads as one exit.
    expect(bk.exits()[0].text).toBe('Solo')
    expect(bk.exits()[0].options.hold).toBe(0)
    expect(bk.exits()[0].options.exit).not.toBe('none')

    rerender({ at: landing(1) })
    expect(result.current.shown).toBeNull()
  })

  it('raises the banner again when the same segment wins twice', () => {
    const bk = stage()
    const { result, rerender } = mount(bk, landing(1))
    act(() => result.current.dismiss())

    // A spin, then the same wedge again. Only the landing id tells them apart.
    rerender({ at: null })
    rerender({ at: landing(2) })

    expect(result.current.shown).toBe('Solo')
  })

  it('takes the word down when the next spin starts', () => {
    const bk = stage()
    const { result, rerender } = mount(bk, landing(1))

    rerender({ at: null })

    expect(result.current.shown).toBeNull()
    expect(bk.exits()).toHaveLength(1)
  })

  it('draws the word again when the wheel changes face', () => {
    const bk = stage()
    const { result, rerender } = renderHook(
      ({ font }: { font: string }) => useBanner(landing(1), { fontUrl: font, create: bk.create }),
      { initialProps: { font: '/fonts/bevan.ttf' } },
    )

    // A new face is a new stage; the word is still up and has to land on it.
    rerender({ font: '/fonts/rye.ttf' })

    expect(result.current.shown).toBe('Solo')
    expect(bk.fires.filter((fire) => fire.options.enter !== 'none')).toHaveLength(2)
  })

  it('wears the tint it was handed, arriving and leaving', () => {
    const bk = stage()
    const { result } = renderHook(() =>
      useBanner(landing(1), { fontUrl: '/fonts/bevan.ttf', tint: 0xe8442a, create: bk.create }),
    )

    act(() => result.current.dismiss())

    // Both fires, or dismissing it swaps the color on the way out.
    for (const fire of bk.fires) expect(fire.options.tint).toBe(0xe8442a)
    expect(bk.fires).toHaveLength(2)
  })

  it('wears the material it was handed, arriving and leaving', () => {
    const bk = stage()
    const { result } = renderHook(() =>
      useBanner(landing(1), { fontUrl: '/fonts/bevan.ttf', look: 'oil', create: bk.create }),
    )

    act(() => result.current.dismiss())

    // Both fires, or dismissing it swaps the metal on the way out.
    for (const fire of bk.fires) expect(fire.options.look).toBe('oil')
    expect(bk.fires).toHaveLength(2)
  })

  it('lights both fires the same way', () => {
    const bk = stage()
    const { result } = renderHook(() =>
      useBanner(landing(1), { fontUrl: '/fonts/bevan.ttf', create: bk.create }),
    )

    act(() => result.current.dismiss())

    // The environment is what makes the metal read as metal; relighting it on
    // the way out is a different material leaving than arrived.
    const [arrive, leave] = bk.fires
    expect(LIGHTING_NAMES).toContain(arrive.options.lighting)
    expect(leave.options.lighting).toBe(arrive.options.lighting)
  })

  it('does not dress two landings in a row the same way', () => {
    const bk = stage()
    const { rerender } = mount(bk, landing(1))
    rerender({ at: landing(2, 'Duo') })

    const arrivals = bk.fires.filter((fire) => fire.options.enter !== 'none')
    expect(arrivals).toHaveLength(2)
    expect(arrivals[1].options.enter).not.toBe(arrivals[0].options.enter)
    expect(arrivals[1].options.active).not.toBe(arrivals[0].options.active)
  })

  it('rolls the material when the wedge names none', () => {
    const bk = stage()
    mount(bk, landing(1))
    expect(LOOK_NAMES).toContain(bk.arrival()?.options.look)
  })

  it('leaves the metal its own color when handed no tint', () => {
    const bk = stage()
    mount(bk, landing(1))
    expect(bk.arrival()?.options.tint).toBeUndefined()
  })

  it('raises nothing where the page cannot draw it', () => {
    const bk = stage({ supported: false })
    const { result } = mount(bk, landing(1))

    expect(result.current.shown).toBeNull()
    expect(bk.fires).toHaveLength(0)
  })

  it('raises nothing for a wedge with no name on it', () => {
    const bk = stage()
    const { result } = mount(bk, landing(1, '   '))

    expect(result.current.shown).toBeNull()
    expect(bk.fires).toHaveLength(0)
  })

  it('takes the banner down when the word cannot be drawn', async () => {
    const bk = stage({ fails: true })
    const { result } = mount(bk, landing(1))
    expect(result.current.shown).toBe('Solo')

    // A font that will not load would otherwise leave a modal over an empty screen.
    await act(async () => undefined)

    expect(result.current.shown).toBeNull()
  })

  it('gives the drawing context back on unmount', () => {
    const bk = stage()
    const { unmount } = mount(bk, landing(1))

    unmount()

    expect(bk.destroys()).toBe(1)
  })
})
