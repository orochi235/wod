import { PropertyPanel, PropertyRow } from '@weasel-js/labkit'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MIN_CHURN_INTERVAL_MS, churn } from '../feed/simulated'
import type { SimulatedFeedConfig } from '../feed/types'
import { cryptoRng } from '../wheel/selection'

export type FeedPanelProps = {
  config: SimulatedFeedConfig
  /** Who is in the room. Never persisted: the preset stores how to get a roster, not one. */
  present: string[]
  onPresent: (present: string[]) => void
  onChange: (config: SimulatedFeedConfig) => void
}

/** First occurrence wins, so the order the operator typed the pool in survives. */
function distinct(names: string[]): string[] {
  return names.filter((name, index) => names.indexOf(name) === index)
}

/** One name per line. Blank lines are how a name gets typed, never a name. */
function parsePool(text: string): string[] {
  return text
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name !== '')
}

function sameNames(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index])
}

export function FeedPanel({ config, present, onPresent, onChange }: FeedPanelProps) {
  const [running, setRunning] = useState(false)

  // The textarea holds the operator's raw text, not `config.pool.join('\n')`.
  // A blank line has no representation in the parsed pool, so a value rendered
  // back out of it swallows the newline the instant Enter is pressed and the
  // next name lands on the end of the previous one.
  const [draft, setDraft] = useState(() => config.pool.join('\n'))
  const [seeded, setSeeded] = useState(config.pool)
  if (seeded !== config.pool) {
    setSeeded(config.pool)
    // Only when the pool came from somewhere else — an import, or another
    // panel. Re-seeding from the operator's own edit is what eats the newline.
    if (!sameNames(parsePool(draft), config.pool)) setDraft(config.pool.join('\n'))
  }

  // The tick reads the latest props without restarting the interval, which
  // would otherwise reset the clock on every roster change it causes.
  //
  // A layout effect, not a passive one: passive effects are flushed after the
  // browser is free to service timer tasks, so a tick landing in that gap would
  // churn from the roster as it stood before the operator's last edit and hand
  // it back through onPresent — overwriting the edit, not merely lagging it.
  // Layout effects run inside commit, which closes the same gap without writing
  // to the ref during render, where a render that is discarded rather than
  // committed would leave props behind that the panel never actually had.
  const latest = useRef({ config, present, onPresent })
  useLayoutEffect(() => {
    latest.current = { config, present, onPresent }
  })

  // Re-applied here and not merely trusted from the parser, which can only
  // guarantee the value it handed over — `config` is live, and an edit can
  // drive it below the floor between two parses.
  const requested = config.autochurn.intervalMs
  const tickMs = Number.isFinite(requested)
    ? Math.max(MIN_CHURN_INTERVAL_MS, requested)
    : MIN_CHURN_INTERVAL_MS

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const { config: current, present: room, onPresent: publish } = latest.current
      publish(churn(current, room, cryptoRng))
    }, tickMs)
    return () => window.clearInterval(id)
    // Everything else the tick reads comes through `latest`, and churn is pure:
    // a new pool or target size takes effect on the next tick without the
    // restart that would shift every later tick's phase.
  }, [running, tickMs])

  const editPool = (text: string) => {
    setDraft(text)
    // Duplicates are kept as typed — the textarea has to stay a faithful mirror
    // of the operator's keystrokes, and churn tolerates a repeated pool entry.
    // They are collapsed where they would do damage: the join list below.
    const pool = parsePool(text)
    onChange({ ...config, pool })

    // Reconciled now rather than left to churn's next tick. The wheel follows
    // this roster immediately, and with the clock stopped there is no next tick
    // at all — a name the pool no longer offers would stay spinnable forever.
    //
    // The accepted cost is that renaming in place empties the room of whoever
    // was being renamed at the first keystroke, and typing the original text
    // back does not return them — the operator clicks Join again. Waiting for
    // blur or a debounce would spare that, at the price of a real interval in
    // which a deleted name can still win the wheel.
    const kept = present.filter((name) => pool.includes(name))
    if (kept.length !== present.length) onPresent(kept)
  }

  const join = (name: string) => {
    // churn removes by value, so a doubled name would take both copies out on
    // one tick — two people leaving on a move that is meant to move one. The
    // join list below already excludes whoever is in the room; this is what
    // holds the invariant if that ever stops being true.
    if (present.includes(name)) return
    onPresent([...present, name])
  }

  const absent = distinct(config.pool).filter((name) => !present.includes(name))

  return (
    <PropertyPanel title="Simulated meeting">
      <PropertyRow label="Name pool">
        <textarea
          className="feed-panel__pool-input"
          aria-label="Name pool"
          value={draft}
          onChange={(event) => editPool(event.target.value)}
        />
      </PropertyRow>

      <PropertyRow label="Run" variant="checkbox">
        <input
          type="checkbox"
          aria-label="Run"
          checked={running}
          onChange={(event) => setRunning(event.target.checked)}
        />
      </PropertyRow>

      <PropertyRow label="Target size">
        <input
          type="number"
          min={0}
          aria-label="Target size"
          value={config.autochurn.targetSize}
          onChange={(event) => {
            const size = Number.parseInt(event.target.value, 10)
            onChange({
              ...config,
              autochurn: {
                ...config.autochurn,
                targetSize: Number.isFinite(size) ? Math.max(0, size) : 0,
              },
            })
          }}
        />
      </PropertyRow>

      <ul className="feed-panel__roster">
        {present.map((name) => (
          <li key={name}>
            <span>{name}</span>
            <button
              type="button"
              aria-label={`Remove ${name}`}
              onClick={() => onPresent(present.filter((other) => other !== name))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <ul className="feed-panel__pool">
        {absent.map((name) => (
          <li key={name}>
            <button type="button" aria-label={`Join ${name}`} onClick={() => join(name)}>
              + {name}
            </button>
          </li>
        ))}
      </ul>
    </PropertyPanel>
  )
}
