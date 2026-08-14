import { PropertyPanel, PropertyRow } from '@weasel-js/labkit'
import { useEffect, useRef, useState } from 'react'
import type { FeedItem, MeetFeedConfig } from '../feed/types'
import { MeetApiError } from '../meet/api'
import { type Token, clientId, isUsable, requestToken } from '../meet/auth'
import { MIN_POLL_INTERVAL_MS } from '../meet/poll'
import { fetchRoster } from '../meet/roster'

export type MeetPanelProps = {
  config: MeetFeedConfig
  /** Who is in the conference. Never persisted: the preset stores how to get a roster, not one. */
  items: FeedItem[]
  onItems: (items: FeedItem[]) => void
  onChange: (config: MeetFeedConfig) => void
}

function statusNote(pinned: boolean, live: number): string {
  if (pinned)
    return live > 0 ? `pinned conference is not in progress (${live} live)` : 'nothing in progress'
  return live > 1 ? `${live} conferences in progress — pin one` : 'nothing in progress'
}

export function MeetPanel({ config, items, onItems, onChange }: MeetPanelProps) {
  const [token, setToken] = useState<Token | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const id = clientId()

  const connect = async () => {
    setError(null)
    try {
      setToken(await requestToken(Date.now()))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  // The tick reads the latest props without restarting the clock, which would
  // otherwise reset the period on every roster it produces.
  const latest = useRef({ config, onItems })
  latest.current = { config, onItems }

  const value = token?.value ?? null
  const period = Math.max(MIN_POLL_INTERVAL_MS, config.intervalMs)

  useEffect(() => {
    if (value === null) return

    let cancelled = false
    let timer: number | undefined
    let cached: string | null = null

    // setTimeout chained after completion, not setInterval: a stalled request
    // under an interval stacks ticks and lands rosters out of order.
    const tick = async () => {
      const { config: current, onItems: publish } = latest.current
      try {
        const snapshot = await fetchRoster(value, current.conference, cached)
        if (cancelled) return
        cached = snapshot.conference
        if (snapshot.conference === null) {
          // Publishing nothing here would clear the wheel over an ambiguity.
          setNote(statusNote(current.conference.trim() !== '', snapshot.live))
        } else {
          setNote(null)
          publish(snapshot.items)
        }
        setError(null)
      } catch (failure) {
        if (cancelled) return
        // The roster on screen stays. A failed poll never empties the wheel.
        setError(failure instanceof Error ? failure.message : String(failure))
        // A stale note next to a fresh error claims to know something the
        // failed poll just took away.
        setNote(null)
        // A dead token and a denied scope do not fix themselves, and retrying
        // either every few seconds only spends quota. Anything else — a blip, a
        // 500 — is worth another go.
        if (failure instanceof MeetApiError && (failure.status === 401 || failure.status === 403)) {
          if (failure.status === 401) setToken(null)
          setNow(Date.now())
          // A 403 changes no state, so nothing else cancels the pending tick.
          return
        }
      }
      if (!cancelled) {
        setNow(Date.now())
        timer = window.setTimeout(tick, period)
      }
    }

    void tick()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [value, period])

  const connected = isUsable(token, now)

  if (id === '') {
    return (
      <PropertyPanel title="Google Meet">
        <p className="meet-panel__status">
          This build has no Google client id, so it cannot sign in.
        </p>
      </PropertyPanel>
    )
  }

  return (
    <PropertyPanel title="Google Meet">
      <PropertyRow label="Connection">
        <button type="button" aria-label={connected ? 'Reconnect' : 'Connect'} onClick={connect}>
          {connected ? 'Reconnect' : 'Connect'}
        </button>
      </PropertyRow>

      <PropertyRow label="Conference">
        <input
          type="text"
          aria-label="Conference"
          value={config.conference}
          placeholder="blank = the only one in progress"
          onChange={(event) => onChange({ ...config, conference: event.target.value })}
        />
      </PropertyRow>

      <PropertyRow label="Interval (ms)">
        <input
          type="number"
          min={MIN_POLL_INTERVAL_MS}
          step={500}
          aria-label="Interval (ms)"
          value={config.intervalMs}
          onChange={(event) => {
            const ms = Number.parseInt(event.target.value, 10)
            onChange({
              ...config,
              intervalMs: Number.isFinite(ms)
                ? Math.max(MIN_POLL_INTERVAL_MS, ms)
                : MIN_POLL_INTERVAL_MS,
            })
          }}
        />
      </PropertyRow>

      <p className="meet-panel__status">
        {connected ? `polling every ${period}ms` : 'not connected'}
        {note ? ` · ${note}` : ''}
      </p>
      {error ? <p className="meet-panel__error">{error}</p> : null}

      <ul className="meet-panel__roster">
        {items.map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
    </PropertyPanel>
  )
}
