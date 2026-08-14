import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { MeetApiError, activeParticipants, liveConferences, pickConference } from '../meet/api'
import { type Person, personOf } from '../meet/identity'
import { rosterDiff } from './diff'
import { consumeTokenFromHash } from './launch'
import './probe.css'

type Entry =
  | {
      kind: 'poll'
      at: number
      seq: number
      ms: number
      present: number
      conference: string | null
      candidates: number
    }
  | {
      kind: 'join' | 'leave'
      at: number
      person: Person
      sinceMarkMs: number | null
      flap: boolean
    }
  | { kind: 'mark'; at: number; note: string }
  | { kind: 'note'; at: number; message: string }
  | { kind: 'error'; at: number; message: string }

/** A rejoin this soon after a leave is the API flapping, not a person moving. */
const FLAP_WINDOW_MS = 20_000

/** Beyond this, a roster change is unlikely to belong to the last mark. */
const MARK_WINDOW_MS = 120_000

function clock(at: number): string {
  const d = new Date(at)
  const hh = `${d.getHours()}`.padStart(2, '0')
  const mm = `${d.getMinutes()}`.padStart(2, '0')
  const ss = `${d.getSeconds()}`.padStart(2, '0')
  return `${hh}:${mm}:${ss}.${Math.floor(d.getMilliseconds() / 100)}`
}

function describe(entry: Entry): string {
  switch (entry.kind) {
    case 'poll': {
      const watching = entry.conference
        ? ''
        : ` · watching nothing (${entry.candidates} in progress)`
      return `#${entry.seq} ${entry.present} present · ${entry.ms}ms${watching}`
    }
    case 'join':
    case 'leave': {
      const lag =
        entry.sinceMarkMs === null ? '' : ` · +${(entry.sinceMarkMs / 1000).toFixed(1)}s after mark`
      return `${entry.kind === 'join' ? 'JOIN ' : 'LEAVE'} ${entry.person.label} [${entry.person.kind}]${lag}${entry.flap ? ' · FLAP?' : ''}`
    }
    case 'mark':
      return `MARK ${entry.note}`
    case 'note':
      return entry.message
    case 'error':
      return `ERROR ${entry.message}`
  }
}

export type ProbeProps = {
  /** From `#token=`, which also starts the run — see `consumeTokenFromHash`. */
  initialToken?: string
}

export function Probe({ initialToken }: ProbeProps) {
  const [token, setToken] = useState(initialToken ?? '')
  const [intervalMs, setIntervalMs] = useState(5000)
  const [running, setRunning] = useState(initialToken !== undefined)
  const [entries, setEntries] = useState<Entry[]>([])
  const [note, setNote] = useState('')

  const push = useCallback((entry: Entry) => {
    // Also to the console, so a probe left running is readable from devtools
    // without scrolling the page.
    console.log(`${clock(entry.at)} ${describe(entry)}`)
    setEntries((current) => [entry, ...current])
  }, [])

  // Re-arming an already-open probe changes only the fragment, which is a
  // same-document navigation: nothing reloads and `main.tsx` never runs again.
  useEffect(() => {
    const onHashChange = () => {
      const next = consumeTokenFromHash()
      if (next === null) return
      setToken(next)
      setRunning(true)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // A ref, not a dependency: retyping the pin must not tear down the poll loop
  // on every keystroke.
  const [pinned, setPinned] = useState('')
  const pin = useRef('')
  pin.current = pinned

  const lastMark = useRef<{ at: number; note: string } | null>(null)

  const mark = (event: FormEvent) => {
    event.preventDefault()
    const at = Date.now()
    const text = note.trim() || 'unlabeled'
    lastMark.current = { at, note: text }
    push({ kind: 'mark', at, note: text })
    setNote('')
  }

  useEffect(() => {
    if (!running) return

    let cancelled = false
    let timer: number | undefined
    let previous: Person[] | null = null
    let seq = 0
    const lastTransition = new Map<string, { kind: 'join' | 'leave'; at: number }>()

    const transition = (kind: 'join' | 'leave', person: Person, at: number) => {
      const prior = lastTransition.get(person.id)
      const flap = prior !== undefined && prior.kind !== kind && at - prior.at < FLAP_WINDOW_MS
      lastTransition.set(person.id, { kind, at })

      const since = lastMark.current
      const sinceMarkMs = since !== null && at - since.at < MARK_WINDOW_MS ? at - since.at : null
      push({ kind, at, person, sinceMarkMs, flap })
    }

    let lastAmbiguity = ''

    const tick = async () => {
      const started = Date.now()
      try {
        const records = await liveConferences(token)
        const conference = pickConference(records, pin.current)
        const people = conference
          ? (await activeParticipants(conference.name, token)).map(personOf)
          : []
        if (cancelled) return

        const at = Date.now()

        if (conference === null && records.length > 1) {
          const message = `${records.length} conferences in progress, pin one: ${records
            .map((record) => record.name)
            .join(' ')}`
          if (message !== lastAmbiguity) {
            push({ kind: 'note', at, message })
            lastAmbiguity = message
          }
        } else if (conference !== null) {
          lastAmbiguity = ''
        }

        if (conference && previous === null) {
          push({ kind: 'note', at, message: `conference ${conference.name}` })
        }
        if (!conference && previous !== null) {
          push({ kind: 'note', at, message: 'conference no longer being watched' })
          previous = null
        }

        if (conference) {
          if (previous !== null) {
            const { joined, left } = rosterDiff(previous, people)
            for (const person of joined) transition('join', person, at)
            for (const person of left) transition('leave', person, at)
          }
          previous = people
        }

        seq += 1
        push({
          kind: 'poll',
          at,
          seq,
          ms: at - started,
          present: people.length,
          conference: conference?.name ?? null,
          candidates: records.length,
        })
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        push({ kind: 'error', at: Date.now(), message })
        if (error instanceof MeetApiError && error.status === 401) {
          push({
            kind: 'note',
            at: Date.now(),
            message: 'token expired — get a fresh one and start again',
          })
          setRunning(false)
          return
        }
      }
      if (!cancelled) timer = window.setTimeout(tick, intervalMs)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [running, token, intervalMs, push])

  const download = () => {
    const lines = [...entries].reverse().map((entry) => JSON.stringify(entry))
    const blob = new Blob([`${lines.join('\n')}\n`], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `meet-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="probe">
      <h1>Meet roster liveness probe</h1>

      <div className="probe__row">
        <label>
          <span>Token</span>
          <input
            type="password"
            value={token}
            placeholder="ya29...."
            onChange={(event) => setToken(event.target.value)}
            disabled={running}
          />
        </label>
        <label>
          <span>Every</span>
          <input
            type="number"
            min={1000}
            step={500}
            size={6}
            value={intervalMs}
            onChange={(event) => setIntervalMs(Math.max(1000, Number(event.target.value)))}
            disabled={running}
          />
          <span>ms</span>
        </label>
        <button type="button" onClick={() => setRunning(!running)} disabled={token.length === 0}>
          {running ? 'Stop' : 'Start'}
        </button>
        <button type="button" onClick={download} disabled={entries.length === 0}>
          Download JSONL
        </button>
      </div>

      <div className="probe__row">
        <label>
          <span>Conference</span>
          <input
            type="text"
            value={pinned}
            placeholder="blank = the only one in progress"
            onChange={(event) => setPinned(event.target.value)}
          />
        </label>
      </div>

      <form className="probe__row" onSubmit={mark}>
        <input
          type="text"
          value={note}
          placeholder='ground truth, e.g. "alice joined now"'
          onChange={(event) => setNote(event.target.value)}
        />
        <button type="submit">Mark</button>
      </form>

      <p className="probe__status">
        {running ? `polling every ${intervalMs}ms` : 'stopped'} · {entries.length} entries
      </p>

      <div className="probe__log">
        {entries.map((entry) => (
          <div
            key={`${entry.at}-${entry.kind}-${describe(entry)}`}
            className={`probe__entry probe__entry--${entry.kind}`}
          >
            {clock(entry.at)} {describe(entry)}
          </div>
        ))}
      </div>
    </main>
  )
}
