import { describe, expect, it } from 'vitest'
import { RENEW_MARGIN_MS, isUsable, tokenOf } from './auth'

describe('tokenOf', () => {
  it('stamps the expiry from the response lifetime', () => {
    expect(tokenOf({ access_token: 'ya29.x', expires_in: 3600 }, 1_000)).toEqual({
      value: 'ya29.x',
      expiresAt: 1_000 + 3_600_000,
    })
  })

  it('is null when the response carries no token', () => {
    expect(tokenOf({ error: 'access_denied' }, 0)).toBeNull()
    expect(tokenOf({ access_token: '' }, 0)).toBeNull()
  })

  // A response with no lifetime is not a token worth trusting for an hour.
  it('treats a missing lifetime as already expired', () => {
    expect(tokenOf({ access_token: 'ya29.x' }, 1_000)).toEqual({
      value: 'ya29.x',
      expiresAt: 1_000,
    })
  })
})

describe('isUsable', () => {
  it('is false for no token', () => {
    expect(isUsable(null, 0)).toBe(false)
  })

  // Reconnect before the token dies, not after a poll has already failed.
  it('goes false a margin before expiry', () => {
    const token = { value: 'ya29.x', expiresAt: 1_000_000 }
    expect(isUsable(token, 1_000_000 - RENEW_MARGIN_MS - 1)).toBe(true)
    expect(isUsable(token, 1_000_000 - RENEW_MARGIN_MS)).toBe(false)
  })
})
