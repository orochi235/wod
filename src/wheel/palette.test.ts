import { describe, expect, it } from 'vitest'
import { effectiveColor } from './palette'
import type { Segment } from './types'

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'beer', label: 'free beer', weight: 0, color: '#ffd166' },
]

describe('effectiveColor', () => {
  it('returns an explicit color when the segment has one', () => {
    expect(effectiveColor(segments, 'beer')).toBe('#ffd166')
  })

  it('falls back to the palette entry for the segment index', () => {
    expect(effectiveColor(segments, 'ana')).toBe('#f4a261')
  })

  it('returns null for an unknown segment', () => {
    expect(effectiveColor(segments, 'nobody')).toBeNull()
  })
})
