import { beforeEach, describe, expect, it } from 'vitest'
import { consumeTokenFromHash } from './launch'

const visit = (hash: string) => {
  window.history.replaceState(null, '', `/probe.html${hash}`)
}

describe('consumeTokenFromHash', () => {
  beforeEach(() => visit(''))

  it('reads the token and strips it from the url', () => {
    visit('#token=ya29.abc')
    expect(consumeTokenFromHash()).toBe('ya29.abc')
    expect(window.location.hash).toBe('')
  })

  it('leaves an unrelated fragment alone', () => {
    visit('#anchor')
    expect(consumeTokenFromHash()).toBeNull()
    expect(window.location.hash).toBe('#anchor')
  })

  it('keeps other params while removing the token', () => {
    visit('#interval=2000&token=ya29.abc')
    expect(consumeTokenFromHash()).toBe('ya29.abc')
    expect(window.location.hash).toBe('#interval=2000')
  })

  // A token.sh that failed silently would otherwise arm the probe with ''.
  it('treats an empty token as absent', () => {
    visit('#token=')
    expect(consumeTokenFromHash()).toBeNull()
  })

  it('is a no-op with no fragment', () => {
    expect(consumeTokenFromHash()).toBeNull()
    expect(window.location.hash).toBe('')
  })
})
