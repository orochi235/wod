import { afterEach, describe, expect, it } from 'vitest'
import { songsEnabled } from './enabled'

describe('songsEnabled', () => {
  afterEach(() => {
    window.location.hash = ''
  })

  it('is off with no hash query', () => {
    window.location.hash = '#/'
    expect(songsEnabled()).toBe(false)
  })

  it('is off when the query lacks the flag', () => {
    window.location.hash = '#/?rig=1'
    expect(songsEnabled()).toBe(false)
  })

  it('is on with the flag, bare or beside others', () => {
    window.location.hash = '#/?songs'
    expect(songsEnabled()).toBe(true)
    window.location.hash = '#/cash-wheel?rig=1&songs'
    expect(songsEnabled()).toBe(true)
  })
})
