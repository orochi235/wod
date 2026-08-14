import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MeetFeedConfig } from '../feed/types'
import { MeetPanel } from './MeetPanel'

const config: MeetFeedConfig = {
  kind: 'meet',
  id: 'meet',
  defaults: { weight: 1 },
  conference: '',
  intervalMs: 5000,
}

const noop = () => {}

/** Resolves a click on Connect with the given access token, synchronously. */
function stubGoogleSignIn(accessToken = 'ya29.token') {
  vi.stubGlobal('google', {
    accounts: {
      oauth2: {
        initTokenClient: ({ callback }: { callback: (r: unknown) => void }) => ({
          requestAccessToken: () => callback({ access_token: accessToken, expires_in: 3600 }),
        }),
      },
    },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('MeetPanel', () => {
  it('says so when the build has no client id', () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', '')
    render(<MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />)
    expect(screen.getByText(/no Google client id/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /connect/i })).not.toBeInTheDocument()
  })

  it('offers Connect and polls nothing until it is used', () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />)
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renders the roster it is given', () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
    render(
      <MeetPanel
        config={config}
        items={[{ id: 'users/1', label: 'Ana' }]}
        onItems={noop}
        onChange={noop}
      />,
    )
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  // The panel sits one window-drag from a screen share.
  it('never puts the token in the DOM', async () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
    stubGoogleSignIn('ya29.secret')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response),
    )
    const { container } = render(
      <MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /connect/i }))
    expect(container.innerHTML).not.toContain('ya29.secret')
  })

  // Retrying a dead token every poll period spends quota and fixes nothing. A
  // version that kept looping still passed the old assertion, which only
  // waited 50ms of real time against a 5000ms period — this is the fix, and
  // it is checked against exactly that regression below.
  it('stops polling and offers Connect again after a 401', async () => {
    vi.useFakeTimers()
    try {
      vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
      stubGoogleSignIn('ya29.x')
      const fetchSpy = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'expired' }))
      vi.stubGlobal('fetch', fetchSpy)
      render(<MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />)

      // fireEvent, not userEvent: userEvent waits on real timers between its
      // own steps, which never advance while the clock under test is faked.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /connect/i }))
      })
      expect(screen.getByText(/401/)).toBeInTheDocument()
      const after = fetchSpy.mock.calls.length

      await act(() => vi.advanceTimersByTimeAsync(config.intervalMs))

      expect(fetchSpy.mock.calls.length).toBe(after)
      expect(screen.getByRole('button', { name: /^connect$/i })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  // A 403 never clears the token, so `value` never changes and the effect's
  // own cleanup — which happens to stop the 401 case too — never runs here.
  // The explicit `return` is the only thing that stops this loop.
  it('stops polling and offers Connect again after a 403', async () => {
    vi.useFakeTimers()
    try {
      vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
      stubGoogleSignIn('ya29.x')
      const fetchSpy = vi.fn(async () => ({ ok: false, status: 403, text: async () => 'denied' }))
      vi.stubGlobal('fetch', fetchSpy)
      render(<MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /connect/i }))
      })
      expect(screen.getByText(/403/)).toBeInTheDocument()
      const after = fetchSpy.mock.calls.length

      await act(() => vi.advanceTimersByTimeAsync(config.intervalMs))

      expect(fetchSpy.mock.calls.length).toBe(after)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears a stale note once a later poll fails', async () => {
    vi.useFakeTimers()
    try {
      vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
      stubGoogleSignIn()
      let calls = 0
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          calls += 1
          if (calls === 1) {
            return {
              ok: true,
              json: async () => ({
                conferenceRecords: [
                  { name: 'conferenceRecords/a' },
                  { name: 'conferenceRecords/b' },
                ],
              }),
            } as Response
          }
          return { ok: false, status: 500, text: async () => 'boom' } as Response
        }),
      )
      render(<MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /connect/i }))
      })
      expect(screen.getByText(/conferences in progress/)).toBeInTheDocument()

      await act(() => vi.advanceTimersByTimeAsync(config.intervalMs))

      expect(screen.getByText(/500 — boom/)).toBeInTheDocument()
      expect(screen.queryByText(/conferences in progress/)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('edits the pin and the interval through onChange', async () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
    const onChange = vi.fn()
    render(<MeetPanel config={config} items={[]} onItems={noop} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Conference'), 'abc')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ conference: expect.any(String) }),
    )
  })

  describe('conference notes', () => {
    /** Answers the conference list call; nothing here resolves a conference to poll. */
    function stubConferences(names: string[]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('conferenceRecords?')) {
            return {
              ok: true,
              json: async () => ({ conferenceRecords: names.map((name) => ({ name })) }),
            } as Response
          }
          throw new Error(`unexpected fetch: ${url}`)
        }),
      )
    }

    it('reports several conferences in progress when nothing is pinned', async () => {
      vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
      stubGoogleSignIn()
      stubConferences(['conferenceRecords/a', 'conferenceRecords/b'])
      render(<MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />)
      await userEvent.click(screen.getByRole('button', { name: /connect/i }))

      await screen.findByText(/2 conferences in progress — pin one/)
    })

    it('reports nothing in progress when unpinned and none are live', async () => {
      vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
      stubGoogleSignIn()
      stubConferences([])
      render(<MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />)
      await userEvent.click(screen.getByRole('button', { name: /connect/i }))

      await screen.findByText(/nothing in progress/)
    })

    it('reports the pinned conference is not in progress when others are live', async () => {
      vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
      stubGoogleSignIn()
      stubConferences(['conferenceRecords/other'])
      render(
        <MeetPanel
          config={{ ...config, conference: 'zzz' }}
          items={[]}
          onItems={noop}
          onChange={noop}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: /connect/i }))

      await screen.findByText(/pinned conference is not in progress \(1 live\)/)
    })

    it('reports nothing in progress when pinned and none are live', async () => {
      vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
      stubGoogleSignIn()
      stubConferences([])
      render(
        <MeetPanel
          config={{ ...config, conference: 'zzz' }}
          items={[]}
          onItems={noop}
          onChange={noop}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: /connect/i }))

      await screen.findByText(/nothing in progress/)
    })
  })
})
