import { LabShell } from '@weasel-js/labkit'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { composeBase } from '../compose/compose'
import { publishFeed, subscribeFeedRequests } from '../feed/bus'
import { itemsFor } from '../feed/simulated'
import type { FeedConfig, FeedItem } from '../feed/types'
import { spinConfigOf } from '../preset/motion'
import { loadPreset, savePreset } from '../preset/storage'
import type { Preset } from '../preset/types'
import { isRigVisible } from '../rig/visibility'
import { findConflicts } from '../tricks/conflicts'
import { resolveTricks } from '../tricks/resolve'
import { Wheel } from '../wheel/Wheel'
import type { Segment, SpinConfig } from '../wheel/types'
import { useSpin } from '../wheel/useSpin'
import './Editor.css'
import { FeedPanel } from './FeedPanel'
import { MeetPanel } from './MeetPanel'
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

function namesOf(present: Record<string, string[]>, feedId: string): string[] {
  const names = present[feedId]
  return Array.isArray(names) ? names : []
}

function sameItems(a: FeedItem[], b: FeedItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => item.id === b[index].id && item.label === b[index].label)
  )
}

function replaceFeed(feeds: FeedConfig[], next: FeedConfig): FeedConfig[] {
  return feeds.map((existing) => (existing.id === next.id ? next : existing))
}

export function Editor() {
  const [preset, setPreset] = useState<Preset>(loadPreset)
  // Read once: the flag only changes on a load that consumed a `?rig=` param,
  // and that load remounts this anyway.
  const [rigVisible] = useState(isRigVisible)
  const [selectedTrickId, setSelectedTrickId] = useState<string | null>(null)
  // Who is in each simulated meeting, and who each meet feed last reported.
  // Component state, never preset state: the preset stores how to get a
  // roster, and a roster dies with the window.
  const [present, setPresent] = useState<Record<string, string[]>>({})
  const [live, setLive] = useState<Record<string, FeedItem[]>>({})

  // Every edit persists immediately; an open show window picks it up through
  // the storage event, so there is nothing to "apply".
  const update = useCallback((next: Preset) => {
    setPreset(next)
    savePreset(next)
  }, [])

  // Items are derived, never stored: the preset keeps how to get a roster, not
  // who is in it.
  const items = useMemo(() => {
    const record: Record<string, FeedItem[]> = {}
    for (const feed of preset.feeds) {
      record[feed.id] =
        feed.kind === 'simulated' ? itemsFor(namesOf(present, feed.id)) : itemsOf(live, feed.id)
    }
    return record
  }, [preset.feeds, present, live])

  // The editor window owns the clock, so it is the window that publishes. With
  // no editor open the show window's roster freezes at whatever last arrived,
  // which is a comprehensible failure rather than two windows both churning.
  // `preset.feeds` is a new array on every preset edit, so this memo recomputes
  // on any keystroke; the guard below keeps that from republishing an
  // equal-but-not-identical roster and re-rendering the show window for nothing.
  const published = useRef<Record<string, FeedItem[]>>({})
  useEffect(() => {
    for (const [feedId, current] of Object.entries(items)) {
      if (sameItems(itemsOf(published.current, feedId), current)) continue
      published.current = { ...published.current, [feedId]: current }
      publishFeed({ feedId, items: current })
    }
  }, [items])

  // Publishing on change alone leaves a show window opened later showing
  // statics. It announces itself instead, and this answers for every feed.
  useEffect(() => {
    return subscribeFeedRequests(() => {
      for (const [feedId, current] of Object.entries(published.current)) {
        publishFeed({ feedId, items: current })
      }
    })
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

  const conflicts = useMemo(
    () => findConflicts(base, preset.tricks, preset.spin.motion.durationMs),
    [base, preset.tricks, preset.spin.motion.durationMs],
  )

  const spinConfig = useMemo<SpinConfig>(
    () => spinConfigOf(preset.spin.motion, resolved.morphs),
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
    spin({
      resolveLate: (winnerId) =>
        resolveTricks(base, preset.tricks, preset.spin.motion.durationMs, 0, winnerId).morphs,
    })
  }, [spin, base, preset.tricks, preset.spin.motion.durationMs])

  // A spin owns the geometry, running or landed; otherwise the scrubber does.
  const shown = isSpinning || spun ? displaySegments : (scrubbed ?? resolved.segments)

  return (
    <LabShell
      title="wod editor"
      header={
        <>
          <a className="editor__exit" href="#/">
            ← Show page
          </a>
          <PresetIo preset={preset} onImport={update} showExport={rigVisible} />
        </>
      }
    >
      <div className={`editor${rigVisible ? '' : ' editor--locked'}`}>
        <section className="editor__column editor__column--left">
          <SegmentList
            segments={preset.segments}
            base={base}
            tricks={preset.tricks}
            showOwners={rigVisible}
            selectedTrickId={selectedTrickId}
            onChange={(segments) => update({ ...preset, segments })}
            onSelectTrick={setSelectedTrickId}
          />
          {preset.feeds.map((feed) =>
            feed.kind === 'simulated' ? (
              <FeedPanel
                key={feed.id}
                config={feed}
                present={namesOf(present, feed.id)}
                onPresent={(names) => setPresent((current) => ({ ...current, [feed.id]: names }))}
                onChange={(next) => update({ ...preset, feeds: replaceFeed(preset.feeds, next) })}
              />
            ) : (
              <MeetPanel
                key={feed.id}
                config={feed}
                items={itemsOf(live, feed.id)}
                onItems={(next) => setLive((current) => ({ ...current, [feed.id]: next }))}
                onChange={(next) => update({ ...preset, feeds: replaceFeed(preset.feeds, next) })}
              />
            ),
          )}
        </section>
        <section className="editor__column editor__column--center">
          <Wheel segments={shown} rotorRef={rotorRef} />
          <Transport
            segments={resolved.segments}
            morphs={resolved.morphs}
            durationMs={preset.spin.motion.durationMs}
            isSpinning={isSpinning}
            showScrub={rigVisible}
            onSpin={handleSpin}
            onScrub={handleScrub}
          />
          <MotionPanel
            motion={preset.spin.motion}
            onChange={(motion) => update({ ...preset, spin: { ...preset.spin, motion } })}
          />
        </section>
        {rigVisible ? (
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
              items={Object.values(items).flat()}
              overrides={preset.overrides}
              onChange={(overrides) => update({ ...preset, overrides })}
            />
          </section>
        ) : null}
      </div>
    </LabShell>
  )
}
