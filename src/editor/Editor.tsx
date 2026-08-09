import { LabShell } from '@weasel-js/labkit'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { composeBase } from '../compose/compose'
import { publishFeed, subscribeFeedRequests } from '../feed/bus'
import { itemsFor } from '../feed/simulated'
import type { FeedItem } from '../feed/types'
import { loadPreset, savePreset } from '../preset/storage'
import type { Preset } from '../preset/types'
import { findConflicts } from '../tricks/conflicts'
import { resolveTricks } from '../tricks/resolve'
import { Wheel } from '../wheel/Wheel'
import type { Segment, SpinConfig } from '../wheel/types'
import { useSpin } from '../wheel/useSpin'
import './Editor.css'
import { FeedPanel } from './FeedPanel'
import { MotionPanel } from './MotionPanel'
import { OverridesPanel } from './OverridesPanel'
import { PresetIo } from './PresetIo'
import { SegmentList } from './SegmentList'
import { Transport } from './Transport'
import { TrickLibrary } from './TrickLibrary'

/**
 * Never a bare `items[feedId]`, for the same reason composeBase avoids one: a
 * feed id of 'constructor' or '__proto__' resolves through the prototype chain
 * to something that is not an array.
 */
function itemsOf(items: Record<string, FeedItem[]>, feedId: string): FeedItem[] {
  const published = items[feedId]
  return Array.isArray(published) ? published : []
}

export function Editor() {
  const [preset, setPreset] = useState<Preset>(loadPreset)
  const [selectedTrickId, setSelectedTrickId] = useState<string | null>(null)
  // Who is in the simulated meeting. Component state, never preset state: the
  // preset stores how to get a roster, and a roster dies with the window.
  const [present, setPresent] = useState<string[]>([])

  // Every edit persists immediately; an open show window picks it up through
  // the storage event, so there is nothing to "apply".
  const update = useCallback((next: Preset) => {
    setPreset(next)
    savePreset(next)
  }, [])

  const feed = preset.feeds[0]
  // Keyed on the id, never the feed object: every edit to the feed's config
  // hands back a new object, and memoizing on that would rebuild identical
  // items and republish them on each keystroke — a full recompose and wheel
  // re-render for a roster that did not change.
  const feedId = feed?.id

  // Items are derived, never stored: the preset keeps how to get a roster, not
  // who is in it.
  const items = useMemo(() => (feedId ? { [feedId]: itemsFor(present) } : {}), [feedId, present])

  // The editor window owns the clock, so it is the window that publishes. With
  // no editor open the show window's roster freezes at whatever last arrived,
  // which is a comprehensible failure rather than two windows both churning.
  useEffect(() => {
    if (!feedId) return
    publishFeed({ feedId, items: itemsOf(items, feedId) })
  }, [feedId, items])

  // What the last publish said, for answering a window that missed it. A ref
  // rather than a dependency: subscribing on every roster change would open and
  // close a channel on each churn tick, and the answer only ever needs the
  // latest roster.
  const published = useRef<FeedItem[]>([])
  published.current = feedId ? itemsOf(items, feedId) : []

  // Publishing on change alone leaves a show window opened later showing
  // statics, until a change it happens to be present for. It announces itself
  // instead, and this answers.
  useEffect(() => {
    if (!feedId) return
    return subscribeFeedRequests(() => {
      publishFeed({ feedId, items: published.current })
    })
  }, [feedId])

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

  const conflicts = useMemo(
    () => findConflicts(base, preset.tricks, preset.spin.motion.durationMs),
    [base, preset.tricks, preset.spin.motion.durationMs],
  )

  const spinConfig = useMemo<SpinConfig>(
    () => ({
      durationMs: preset.spin.motion.durationMs,
      fullSpins: preset.spin.motion.turns,
      direction: preset.spin.motion.direction,
      easing: preset.spin.motion.easing,
      settle: preset.spin.motion.settle,
      morphs: resolved.morphs,
    }),
    [preset.spin, resolved.morphs],
  )

  const { displaySegments, isSpinning, spin, rotorRef } = useSpin(resolved.segments, spinConfig)
  const [scrubbed, setScrubbed] = useState<Segment[] | null>(null)
  // Handing the wheel back to the scrubber the moment `isSpinning` goes false
  // would erase the landing — the one frame the whole trick exists to produce.
  // `useSpin` keeps that geometry in `displaySegments`, so the editor holds it
  // until the operator moves the scrubber again.
  const [spun, setSpun] = useState(false)

  const handleScrub = useCallback((segments: Segment[]) => {
    setScrubbed(segments)
    setSpun(false)
  }, [])

  const handleSpin = useCallback(() => {
    setSpun(true)
    spin()
  }, [spin])

  // A spin owns the geometry, running or landed; otherwise the scrubber does.
  const shown = isSpinning || spun ? displaySegments : (scrubbed ?? resolved.segments)

  return (
    <LabShell
      title="wod editor"
      header={
        <>
          <a href="#/">Show page</a>
          <PresetIo preset={preset} onImport={update} />
        </>
      }
    >
      <div className="editor">
        <section className="editor__column editor__column--left">
          <SegmentList
            segments={preset.segments}
            base={base}
            tricks={preset.tricks}
            selectedTrickId={selectedTrickId}
            onChange={(segments) => update({ ...preset, segments })}
            onSelectTrick={setSelectedTrickId}
          />
          {feed ? (
            <FeedPanel
              config={feed}
              present={present}
              onPresent={setPresent}
              onChange={(next) =>
                update({
                  ...preset,
                  feeds: preset.feeds.map((existing) =>
                    existing.id === next.id ? next : existing,
                  ),
                })
              }
            />
          ) : null}
        </section>
        <section className="editor__column editor__column--center">
          <Wheel segments={shown} rotorRef={rotorRef} />
          <Transport
            segments={resolved.segments}
            morphs={resolved.morphs}
            durationMs={preset.spin.motion.durationMs}
            isSpinning={isSpinning}
            onSpin={handleSpin}
            onScrub={handleScrub}
          />
          <MotionPanel
            motion={preset.spin.motion}
            onChange={(motion) => update({ ...preset, spin: { ...preset.spin, motion } })}
          />
        </section>
        <section className="editor__column editor__column--right">
          <TrickLibrary
            tricks={preset.tricks}
            segments={resolved.segments}
            conflicts={conflicts}
            selectedId={selectedTrickId}
            onChange={(tricks) => update({ ...preset, tricks })}
            onSelect={setSelectedTrickId}
          />
          <OverridesPanel
            items={feed ? itemsOf(items, feed.id) : []}
            overrides={preset.overrides}
            onChange={(overrides) => update({ ...preset, overrides })}
          />
        </section>
      </div>
    </LabShell>
  )
}
