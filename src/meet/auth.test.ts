import { afterEach, describe, expect, it, vi } from 'vitest'
import { RENEW_MARGIN_MS, isUsable, tokenOf } from './auth'

function loadedScript(calls: unknown[][], index: number): HTMLScriptElement {
  return calls[index][0] as HTMLScriptElement
}

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

describe('loadGis', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('resolves without appending a script when the global is already present', async () => {
    vi.resetModules()
    vi.stubGlobal('google', { accounts: { oauth2: {} } })
    const appendChild = vi.spyOn(document.head, 'appendChild')
    const { loadGis } = await import('./auth')

    await expect(loadGis()).resolves.toBeUndefined()
    expect(appendChild).not.toHaveBeenCalled()
  })

  it('dedupes two concurrent calls into a single appended script', async () => {
    vi.resetModules()
    const appendChild = vi.spyOn(document.head, 'appendChild')
    const { loadGis } = await import('./auth')

    const first = loadGis()
    const second = loadGis()
    expect(appendChild).toHaveBeenCalledTimes(1)

    vi.stubGlobal('google', { accounts: { oauth2: {} } })
    loadedScript(appendChild.mock.calls, 0).onload?.(new Event('load'))

    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
  })

  it('rejects when the script errors, then retries with a new script', async () => {
    vi.resetModules()
    const appendChild = vi.spyOn(document.head, 'appendChild')
    const { loadGis } = await import('./auth')

    const failed = loadGis()
    loadedScript(appendChild.mock.calls, 0).onerror?.(new Event('error'))
    await expect(failed).rejects.toThrow('could not load Google sign-in')

    const retried = loadGis()
    expect(appendChild).toHaveBeenCalledTimes(2)

    vi.stubGlobal('google', { accounts: { oauth2: {} } })
    loadedScript(appendChild.mock.calls, 1).onload?.(new Event('load'))
    await expect(retried).resolves.toBeUndefined()
  })

  it('rejects when onload fires without the global defined, then retries the same way', async () => {
    vi.resetModules()
    const appendChild = vi.spyOn(document.head, 'appendChild')
    const { loadGis } = await import('./auth')

    const blocked = loadGis()
    loadedScript(appendChild.mock.calls, 0).onload?.(new Event('load'))
    await expect(blocked).rejects.toThrow('Google sign-in did not load')

    const retried = loadGis()
    expect(appendChild).toHaveBeenCalledTimes(2)

    vi.stubGlobal('google', { accounts: { oauth2: {} } })
    loadedScript(appendChild.mock.calls, 1).onload?.(new Event('load'))
    await expect(retried).resolves.toBeUndefined()
  })
})
