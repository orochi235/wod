import { render, screen } from '@testing-library/react'
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
    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }: { callback: (r: unknown) => void }) => ({
            requestAccessToken: () => callback({ access_token: 'ya29.secret', expires_in: 3600 }),
          }),
        },
      },
    })
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

  // Retrying a dead token every 5s spends quota and fixes nothing.
  it('stops polling and offers Connect again after a 401', async () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }: { callback: (r: unknown) => void }) => ({
            requestAccessToken: () => callback({ access_token: 'ya29.x', expires_in: 3600 }),
          }),
        },
      },
    })
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'expired' }))
    vi.stubGlobal('fetch', fetchSpy)
    render(<MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />)
    await userEvent.click(screen.getByRole('button', { name: /connect/i }))

    await screen.findByText(/401/)
    const after = fetchSpy.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchSpy.mock.calls.length).toBe(after)
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeInTheDocument()
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
})
