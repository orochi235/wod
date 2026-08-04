import { useCallback, useEffect, useMemo, useState } from 'react'
import { composeBase } from './compose/compose'
import { loadPreset, subscribePreset } from './preset/storage'
import type { Preset } from './preset/types'
import { resolveScriptedSpin } from './spin/resolve'
import { resolveTricks } from './tricks/resolve'
import { Wheel } from './wheel/Wheel'
import { cryptoRng, forced } from './wheel/selection'
import type { SpinConfig } from './wheel/types'
import { useSpin } from './wheel/useSpin'
import './App.css'

export function App() {
  const [preset, setPreset] = useState<Preset>(loadPreset)

  // An edit in the /edit window lands here without a reload.
  useEffect(() => subscribePreset(setPreset), [])

  const base = useMemo(
    () => composeBase({ statics: preset.segments, feeds: [], items: {}, overrides: {} }),
    [preset.segments],
  )

  const resolved = useMemo(
    () => resolveTricks(base, preset.tricks, preset.spin.motion.durationMs),
    [base, preset.tricks, preset.spin.motion.durationMs],
  )

  const config = useMemo<SpinConfig>(
    () => ({
      durationMs: preset.spin.motion.durationMs,
      fullSpins: preset.spin.motion.turns,
      direction: preset.spin.motion.direction,
      easing: preset.spin.motion.easing,
      morphs: resolved.morphs,
    }),
    [preset.spin, resolved.morphs],
  )

  const { displaySegments, isSpinning, winnerId, spin, rotorRef } = useSpin(
    resolved.segments,
    config,
  )

  const onSpin = useCallback(() => {
    const resolution = resolveScriptedSpin(
      base,
      preset.tricks,
      preset.spin,
      preset.branches,
      cryptoRng,
    )
    if (!resolution) return
    spin({
      segments: resolution.segments,
      config: {
        durationMs: resolution.motion.durationMs,
        fullSpins: resolution.motion.turns,
        direction: resolution.motion.direction,
        easing: resolution.motion.easing,
        morphs: resolution.morphs,
      },
      // Resolution already decided who wins; planSpin still decides where in
      // the arc to stop. forced() degrades to a fair draw if that segment's arc
      // collapsed, which is the safety net for a branch that zeroes its winner.
      strategy: forced(resolution.winnerId),
    })
  }, [base, preset, spin])

  const winner = displaySegments.find((segment) => segment.id === winnerId)
  // Nothing to land on. planSpin would return null and the click would quietly
  // do nothing, which reads as a broken button rather than an empty wheel.
  const isEmpty = displaySegments.length === 0

  return (
    <main className="app">
      <Wheel segments={displaySegments} rotorRef={rotorRef} />
      <div className="app__controls">
        <button
          className="app__button"
          type="button"
          onClick={onSpin}
          disabled={isSpinning || isEmpty}
        >
          Spin
        </button>
        <a className="app__button" href="#/edit">
          Edit
        </a>
      </div>
      {isEmpty ? (
        <p className="app__empty">Nothing on the wheel yet — add some segments in the editor.</p>
      ) : (
        <p className="app__result">{winner ? winner.label : ''}</p>
      )}
    </main>
  )
}
