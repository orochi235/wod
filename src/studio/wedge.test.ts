import { describe, expect, it } from 'vitest'
import { previewArc } from './wedge'

describe('previewArc', () => {
  it('straddles noon, where turns are zero', () => {
    expect(previewArc(30)).toEqual({ start: -1 / 24, end: 1 / 24 })
  })
})
