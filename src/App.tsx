import { useCallback, useEffect, useMemo, useState } from 'react'
import { composeBase } from './compose/compose'
import { requestFeeds, subscribeFeed } from './feed/bus'
import type { FeedItem } from './feed/types'
import { spinConfigOf } from './preset/motion'
import { loadPreset, subscribePreset } from './preset/storage'
import type { Preset } from './preset/types'
import { Reveal } from './reveal/Reveal'
import { useReveal } from './reveal/useReveal'
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

  const [items, setItems] = useState<Record<string, FeedItem[]>>({})

  // The editor window owns the clock; this one only renders what arrives. With
  // no editor open the roster freezes, which is a comprehensible failure.
  //
  // Subscribing first, then announcing: this window may have been opened or
  // reloaded long after the last publish, and nothing would resend one until
  // the roster next changed. An editor that is not open cannot answer, which
  // leaves exactly the frozen-roster case above.
  useEffect(() => {
    const stop = subscribeFeed(({ feedId, items: published }) =>
      setItems((current) => ({ ...current, [feedId]: published })),
    )
    requestFeeds()
    return stop
  }, [])

  const base = useMemo(
    () =>
      composeBase({
        statics: preset.segments,
        feeds: preset.feeds,
        items,
        overrides: preset.overrides,
      }),
    [preset.segments, preset.feeds, preset.overrides, items],
  )

  const resolved = useMemo(
    () => resolveTricks(base, preset.tricks, preset.spin.motion.durationMs),
    [base, preset.tricks, preset.spin.motion.durationMs],
  )

  const config = useMemo<SpinConfig>(
    () => spinConfigOf(preset.spin.motion, resolved.morphs),
    [preset.spin, resolved.morphs],
  )

  const { displaySegments, isSpinning, landing, spin, rotorRef } = useSpin(
    resolved.segments,
    config,
  )

  const { shown, dismiss } = useReveal(landing)

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
      config: spinConfigOf(resolution.motion, resolution.morphs),
      // Resolution already decided who wins; planSpin still decides where in
      // the arc to stop. forced() degrades to a fair draw if that segment's arc
      // collapsed, which is the safety net for a branch that zeroes its winner.
      strategy: forced(resolution.winnerId),
      resolveLate: resolution.resolveLate,
    })
  }, [base, preset, spin])

  // Nothing to land on. planSpin would return null and the click would quietly
  // do nothing, which reads as a broken button rather than an empty wheel. Read
  // the resolved roster, not displaySegments: the wheel holds a landed frame
  // until the next spin, so it can still be showing wedges that onSpin no longer
  // has anything to spin.
  const isEmpty = resolved.segments.length === 0

  return (
    <main className="app">
      <Wheel segments={displaySegments} rotorRef={rotorRef} transitions={preset.transitions} />
      <div className="app__controls">
        <button
          className="app__button"
          type="button"
          onClick={onSpin}
          disabled={isSpinning || isEmpty || shown !== null}
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
        <p className="app__result">{landing ? landing.winner.label : ''}</p>
      )}
      {shown === null ? null : (
        <Reveal segment={shown.segment} reveal={shown.reveal} onDismiss={dismiss} />
      )}
    </main>
  )
}
