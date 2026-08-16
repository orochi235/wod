import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Banner } from './banner/Banner'
import { type CreateBanner, useBanner } from './banner/useBanner'
import { composeBase } from './compose/compose'
import { requestFeeds, subscribeFeed } from './feed/bus'
import type { FeedItem } from './feed/types'
import { spinConfigOf } from './preset/motion'
import { getSample } from './preset/samples'
import { loadPreset, subscribePreset } from './preset/storage'
import type { Preset } from './preset/types'
import { Reveal } from './reveal/Reveal'
import { useReveal } from './reveal/useReveal'
import { resolveFont } from './slice/fonts/registry'
import { resolveScriptedSpin } from './spin/resolve'
import { resolveTricks } from './tricks/resolve'
import { Wheel } from './wheel/Wheel'
import type { ChooseColor } from './wheel/colors'
import { hexNumber } from './wheel/ink'
import { cryptoRng, forced } from './wheel/selection'
import { partOn } from './wheel/theme'
import { styleOfTheme } from './wheel/themeStyle'
import { flat } from './wheel/themes/flat'
import { getTheme } from './wheel/themes/registry'
import type { SpinConfig } from './wheel/types'
import { useSpin } from './wheel/useSpin'
import './App.css'

export type AppProps = {
  /** Picks a color for a wedge with none authored. Undefined uses the palette. */
  chooseColor?: ChooseColor
  /** Opens the overlay the winner's name is drawn on. Undefined uses blitsklieg. */
  createBanner?: CreateBanner
  /**
   * Show this sample instead of the stored wheel. The URL is the whole of it:
   * nothing is written, so the wheel someone was working on is still there when
   * they come back to `#/`.
   */
  sample?: string
}

export function App({ chooseColor, createBanner, sample }: AppProps = {}) {
  const [stored, setStored] = useState<Preset>(loadPreset)
  const fixed = sample === undefined ? null : (getSample(sample)?.preset ?? null)
  const preset = fixed ?? stored

  // An edit in the /edit window lands here without a reload. A sample is not
  // the stored wheel and does not follow it.
  useEffect(() => {
    if (fixed !== null) return
    return subscribePreset(setStored)
  }, [fixed])

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
        choose: chooseColor,
      }),
    [base, preset.tricks, preset.spin.motion.durationMs, chooseColor],
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

  // The banner is set in the face the wheel's own wedges are set in, in the
  // material its wedge names, and — where the look asks for it — in the color of
  // the wedge it landed on. Material and tint compose: the tint recolors
  // whichever metal is chosen rather than replacing it.
  const banner = useBanner(landing, {
    fontUrl: resolveFont(undefined, theme.font).file,
    tint: theme.tint === 'wedge' ? (hexNumber(landing?.winner.color) ?? undefined) : undefined,
    look: landing?.winner.look,
    create: createBanner,
  })

  // One takeover at a time: the reveal is a second click to dismiss, and it
  // would otherwise open under type drawn on a canvas it cannot sit above.
  const { shown, dismiss } = useReveal(banner.shown === null ? landing : null)

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
      { previous: colorsRef.current, retained: retainedRef.current, choose: chooseColor },
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
  }, [base, preset, spin, theme, chooseColor])

  // Nothing to land on. planSpin would return null and the click would quietly
  // do nothing, which reads as a broken button rather than an empty wheel. Read
  // the resolved roster, not displaySegments: the wheel holds a landed frame
  // until the next spin, so it can still be showing wedges that onSpin no longer
  // has anything to spin.
  const isEmpty = resolved.segments.length === 0

  // A look with a stage owns the page it is shown on, not a square behind the
  // wheel: this is the screen everyone is looking at, and the white margin
  // around a dark wheel was the only thing on it that was not the show.
  const staged = partOn(theme, 'stage')

  // One condition, worn by the button and by the wheel alike. The wheel is the
  // obvious thing to hit in a room, so the host offers the click rather than the
  // wheel itself: `Wheel` draws, and what a click means belongs to the page it
  // is drawn on. Pointer only — the button beside it is the control that carries
  // a name and a tab stop, and a second one for the same spin would announce
  // itself twice.
  const canSpin = !isSpinning && !isEmpty && shown === null && banner.shown === null

  return (
    <main className={staged ? 'app app--staged' : 'app'} style={styleOfTheme(theme)}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the Spin button is this action's keyboard control; a second tab stop would announce the same spin twice. */}
      <div
        className={canSpin ? 'app__stage app__stage--live' : 'app__stage'}
        onClick={canSpin ? onSpin : undefined}
      >
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
      </div>
      <div className="app__controls">
        <button className="app__button" type="button" onClick={onSpin} disabled={!canSpin}>
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
      {banner.shown === null ? null : <Banner label={banner.shown} onDismiss={banner.dismiss} />}
      {shown === null ? null : (
        <Reveal segment={shown.segment} reveal={shown.reveal} onDismiss={dismiss} />
      )}
    </main>
  )
}
