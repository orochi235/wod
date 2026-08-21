import { describe, expect, it } from 'vitest'
import { type Breakpoint, sliceAt } from './breakpoints'

const plate: Breakpoint = { from: 1 / 12, slice: { id: 'composed', params: {} } }
const initials: Breakpoint = { from: 0, slice: { id: 'radial', params: {} } }

describe('sliceAt', () => {
  it('takes the widest breakpoint the wedge still clears', () => {
    expect(sliceAt([plate, initials], 1 / 12)?.id).toBe('composed')
    expect(sliceAt([plate, initials], 1 / 6)?.id).toBe('composed')
  })

  it('drops to a narrower breakpoint below the floor', () => {
    expect(sliceAt([plate, initials], 1 / 45)?.id).toBe('radial')
  })

  it('reads the same list either way up', () => {
    expect(sliceAt([initials, plate], 1 / 6)?.id).toBe('composed')
    expect(sliceAt([initials, plate], 1 / 45)?.id).toBe('radial')
  })

  it('resolves nothing when the wedge clears no floor', () => {
    expect(sliceAt([plate], 1 / 45)).toBeUndefined()
  })

  it('resolves nothing without a list or without a width', () => {
    expect(sliceAt(undefined, 1 / 6)).toBeUndefined()
    expect(sliceAt([plate], undefined)).toBeUndefined()
    expect(sliceAt([initials], Number.NaN)).toBeUndefined()
  })
})
