import { beforeEach, describe, expect, it } from 'vitest'
import { RIG_KEY, consumeRigParam, isRigVisible } from './visibility'

function at(hash: string) {
  window.history.replaceState(null, '', `/${hash}`)
}

describe('isRigVisible', () => {
  beforeEach(() => {
    window.localStorage.clear()
    at('#/edit')
  })

  it('is locked with nothing stored', () => {
    expect(isRigVisible()).toBe(false)
  })

  it('is unlocked once the flag is set', () => {
    window.localStorage.setItem(RIG_KEY, '1')
    expect(isRigVisible()).toBe(true)
  })

  it('treats any other stored value as locked', () => {
    window.localStorage.setItem(RIG_KEY, 'yes')
    expect(isRigVisible()).toBe(false)
  })
})

describe('consumeRigParam', () => {
  beforeEach(() => {
    window.localStorage.clear()
    at('#/edit')
  })

  it('sets the flag and strips the param', () => {
    at('#/edit?rig=1')
    consumeRigParam()
    expect(isRigVisible()).toBe(true)
    expect(window.location.hash).toBe('#/edit')
  })

  it('clears the flag on rig=0', () => {
    window.localStorage.setItem(RIG_KEY, '1')
    at('#/edit?rig=0')
    consumeRigParam()
    expect(isRigVisible()).toBe(false)
    expect(window.location.hash).toBe('#/edit')
  })

  it('leaves the flag and the url alone with no param', () => {
    window.localStorage.setItem(RIG_KEY, '1')
    at('#/edit')
    consumeRigParam()
    expect(isRigVisible()).toBe(true)
    expect(window.location.hash).toBe('#/edit')
  })

  it('keeps unrelated query params', () => {
    at('#/edit?seed=7&rig=1&x=2')
    consumeRigParam()
    expect(isRigVisible()).toBe(true)
    expect(window.location.hash).toBe('#/edit?seed=7&x=2')
  })

  // Back must not return to the unlocking url, or the trace the strip removes
  // comes right back.
  it('replaces the history entry rather than adding one', () => {
    const before = window.history.length
    at('#/edit?rig=1')
    consumeRigParam()
    expect(window.history.length).toBe(before)
  })

  it('still routes to the editor after the strip', () => {
    at('#/edit?rig=1')
    consumeRigParam()
    expect(window.location.hash).toBe('#/edit')
  })

  it('survives a param on the show route', () => {
    at('#/?rig=1')
    consumeRigParam()
    expect(isRigVisible()).toBe(true)
    expect(window.location.hash).toBe('#/')
  })
})
