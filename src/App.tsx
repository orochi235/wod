import { useEffect, useMemo, useState } from 'react'
import { loadPreset, subscribePreset } from './preset/storage'
import type { Preset } from './preset/types'
import { resolveTricks } from './tricks/resolve'
import { Wheel } from './wheel/Wheel'
import type { SpinConfig } from './wheel/types'
import { useSpin } from './wheel/useSpin'
import './App.css'

export function App() {
  const [preset, setPreset] = useState<Preset>(loadPreset)

  // An edit in the /edit window lands here without a reload.
  useEffect(() => subscribePreset(setPreset), [])

  const resolved = useMemo(
    () => resolveTricks(preset.segments, preset.tricks, preset.spin.durationMs),
    [preset],
  )

  const config = useMemo<SpinConfig>(
    () => ({
      durationMs: preset.spin.durationMs,
      fullSpins: preset.spin.fullSpins,
      easing: preset.spin.easing,
      morphs: resolved.morphs,
    }),
    [preset.spin, resolved.morphs],
  )

  const { displaySegments, isSpinning, winnerId, spin, rotorRef } = useSpin(
    resolved.segments,
    config,
  )
  const winner = displaySegments.find((segment) => segment.id === winnerId)

  return (
    <main className="app">
      <Wheel segments={displaySegments} rotorRef={rotorRef} />
      <div className="app__controls">
        <button className="app__button" type="button" onClick={() => spin()} disabled={isSpinning}>
          Spin
        </button>
        <a className="app__button" href="#/edit">
          Edit
        </a>
      </div>
      <p className="app__result">{winner ? winner.label : ''}</p>
    </main>
  )
}
