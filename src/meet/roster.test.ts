import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRoster } from './roster'

type Reply = { url: RegExp; body: unknown }

/** Answers each call with the first reply whose url matches, and records calls. */
function stubFetch(replies: Reply[]): string[] {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const reply = replies.find((candidate) => candidate.url.test(url))
      if (!reply) throw new Error(`unexpected fetch: ${url}`)
      return { ok: true, json: async () => reply.body } as Response
    }),
  )
  return calls
}

/** Answers each call with the next body in order, whatever the url. */
function scriptFetch(bodies: unknown[]): string[] {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = bodies[calls.length]
      calls.push(url)
      if (body === undefined) throw new Error(`unscripted fetch: ${url}`)
      return { ok: true, json: async () => body } as Response
    }),
  )
  return calls
}

const conferences = (...ids: string[]) => ({
  url: /conferenceRecords\?/,
  body: { conferenceRecords: ids.map((id) => ({ name: `conferenceRecords/${id}` })) },
})

const participants = (...names: string[]) => ({
  url: /participants\?/,
  body: {
    participants: names.map((name, index) => ({
      name: `p/${index}`,
      signedinUser: { user: `users/${index}`, displayName: name },
    })),
  },
})

afterEach(() => vi.unstubAllGlobals())

describe('fetchRoster', () => {
  it('resolves the sole conference and returns its roster', async () => {
    stubFetch([conferences('a'), participants('Ana', 'Ben')])
    const snapshot = await fetchRoster('tok', '', null)
    expect(snapshot.conference).toBe('conferenceRecords/a')
    expect(snapshot.items).toEqual([
      { id: 'users/0', label: 'Ana' },
      { id: 'users/1', label: 'Ben' },
    ])
  })

  // The saving worth having: at 5s a poll, the list call is pure overhead.
  it('costs one request once the conference is known', async () => {
    const calls = stubFetch([conferences('a'), participants('Ana')])
    await fetchRoster('tok', '', 'conferenceRecords/a')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('participants')
  })

  it('re-lists when the cached conference comes back empty', async () => {
    const calls = scriptFetch([
      participants().body,
      conferences('b').body,
      participants('Ana').body,
    ])
    const snapshot = await fetchRoster('tok', '', 'conferenceRecords/a')
    expect(calls).toHaveLength(3)
    expect(snapshot.conference).toBe('conferenceRecords/b')
    expect(snapshot.items).toEqual([{ id: 'users/0', label: 'Ana' }])
  })

  it('ignores a cached conference the pin no longer names', async () => {
    const calls = stubFetch([conferences('b'), participants('Ana')])
    const snapshot = await fetchRoster('tok', 'b', 'conferenceRecords/a')
    expect(snapshot.conference).toBe('conferenceRecords/b')
    expect(calls[0]).toContain('conferenceRecords?')
  })

  it('watches nothing when several are in progress and none is pinned', async () => {
    stubFetch([conferences('a', 'b')])
    const snapshot = await fetchRoster('tok', '', null)
    expect(snapshot).toEqual({ conference: null, items: [], live: 2 })
  })
})
