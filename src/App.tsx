import { useMemo, useState } from 'react'
import { Wheel } from './wheel/Wheel'
import type { Morph, Segment, SpinConfig } from './wheel/types'
import { useSpin } from './wheel/useSpin'
import './App.css'

const SEGMENTS: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
  { id: 'cal', label: 'Cal', weight: 1 },
  { id: 'dee', label: 'Dee', weight: 1 },
  { id: 'eli', label: 'Eli', weight: 1 },
  { id: 'beer', label: 'free beer', weight: 0.02, color: '#ffd166' },
]

const DURATION_MS = 4500

/** The headline gag: a sliver swells to swallow the wheel while it is turning. */
const BEER_TAKEOVER: Morph[] = [
  {
    segmentId: 'beer',
    durationMs: DURATION_MS,
    easing: 'easeIn',
    keyframes: [
      { at: 0, weight: 0.02, color: '#ffd166' },
      { at: 0.6, weight: 0.02, color: '#ffd166' },
      { at: 1, weight: 1, color: '#ff8811' },
    ],
  },
  ...['ana', 'ben', 'cal', 'dee', 'eli'].map<Morph>((id) => ({
    segmentId: id,
    durationMs: DURATION_MS,
    easing: 'easeIn',
    keyframes: [
      { at: 0, weight: 1 },
      { at: 0.6, weight: 1 },
      { at: 1, weight: 0 },
    ],
  })),
]

export function App() {
  const [riggedForBeer, setRiggedForBeer] = useState(false)

  const config = useMemo<SpinConfig>(
    () => ({
      durationMs: DURATION_MS,
      fullSpins: 6,
      easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)',
      morphs: riggedForBeer ? BEER_TAKEOVER : [],
    }),
    [riggedForBeer],
  )

  const { displaySegments, isSpinning, winnerId, spin, rotorRef } = useSpin(SEGMENTS, config)
  const winner = displaySegments.find((s) => s.id === winnerId)

  return (
    <main className="app">
      <Wheel segments={displaySegments} rotorRef={rotorRef} />
      <div className="app__controls">
        <button className="app__button" type="button" onClick={() => spin()} disabled={isSpinning}>
          Spin
        </button>
        <button
          className="app__button"
          type="button"
          onClick={() => setRiggedForBeer((v) => !v)}
          disabled={isSpinning}
        >
          {riggedForBeer ? 'Takeover: on' : 'Takeover: off'}
        </button>
      </div>
      <p className="app__result">{winner ? winner.label : ''}</p>
    </main>
  )
}
