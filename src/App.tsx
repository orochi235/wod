import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { flat } from './wheel/themes/flat'
import { getTheme } from './wheel/themes/registry'
import type { SpinConfig } from './wheel/types'
import { useSpin } from './wheel/useSpin'
import './App.css'

export function App() {
  const [preset, setPreset] = useState<Preset>(loadPreset)

  // An edit in the /edit window lands here without a reload.
  useEffect(() => subscribePreset(setPreset), [])

  const [items, setItems] = useState<Record<string, FeedItem[]>>({})
  const [muted, setMuted] = useState(false)
  const theme = getTheme(preset.theme ?? '') ?? flat

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

  const colorsRef = useRef(new Map<string, string>())
  const retainedRef = useRef<ReadonlySet<string>>(new Set())

  // The refs are deliberately not dependencies. This recomputes on the composed
  // roster and reads them at that moment; anything narrower re-assigns a roster
  // it has already colored, anything wider re-assigns on every frame of a spin.
  const resolved = useMemo(
    () =>
      resolveTricks(base, preset.tricks, preset.spin.motion.durationMs, 0, null, {
        previous: colorsRef.current,
        retained: retainedRef.current,
      }),
    [base, preset.tricks, preset.spin.motion.durationMs],
  )
  colorsRef.current = resolved.colors

  const config = useMemo<SpinConfig>(
    () => spinConfigOf(preset.spin.motion, resolved.morphs),
    [preset.spin, resolved.morphs],
  )

  const {
    displaySegments,
    layoutSegments,
    isSpinning,
    held,
    landing,
    spin,
    release,
    reset,
    rotorRef,
    levelRef,
  } = useSpin(resolved.segments, config)

  const { shown, dismiss } = useReveal(landing)

  // A reveal that opened and closed is the one signal the show page gets that a
  // landing has been seen, so it is what hands the wheel back to the roster.
  // Covers a hold timing out as well as a click, which wrapping `dismiss` would
  // not. A winner with no reveal raises nothing to close and holds until Reset.
  const revealedId = useRef<number | null>(null)
  useEffect(() => {
    if (shown !== null) {
      revealedId.current = landing?.id ?? null
      return
    }
    if (landing !== null && revealedId.current === landing.id) release()
  }, [shown, landing, release])

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
      catchPegs: theme.flapper === 'catch' ? theme.pegs : undefined,
    })
  }, [base, preset, spin, theme])

  // Nothing to land on. planSpin would return null and the click would quietly
  // do nothing, which reads as a broken button rather than an empty wheel. Read
  // the resolved roster, not displaySegments: the wheel holds a landed frame
  // until the next spin, so it can still be showing wedges that onSpin no longer
  // has anything to spin.
  const isEmpty = resolved.segments.length === 0

  return (
    <main className="app">
      <Wheel
        segments={displaySegments}
        layoutFrom={layoutSegments}
        slice={preset.slice}
        rotorRef={rotorRef}
        levelRef={levelRef}
        transitions={preset.transitions}
        retainedRef={retainedRef}
        held={held}
        theme={theme}
        muted={muted}
      />
      <div className="app__controls">
        <button
          className="app__button"
          type="button"
          onClick={onSpin}
          disabled={isSpinning || isEmpty || shown !== null}
        >
          Spin
        </button>
        <button
          className="app__button"
          type="button"
          onClick={reset}
          disabled={landing === null || isSpinning}
        >
          Reset
        </button>
        {theme.flapper !== 'silent' && (
          <button type="button" className="app__button" onClick={() => setMuted((on) => !on)}>
            {muted ? 'Unmute' : 'Mute'}
          </button>
        )}
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
