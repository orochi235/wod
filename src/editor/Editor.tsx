import { LabShell } from '@weasel-js/labkit'
import { useCallback, useMemo, useState } from 'react'
import { loadPreset, savePreset } from '../preset/storage'
import type { Preset } from '../preset/types'
import { findConflicts } from '../tricks/conflicts'
import { resolveTricks } from '../tricks/resolve'
import { Wheel } from '../wheel/Wheel'
import type { Segment, SpinConfig } from '../wheel/types'
import { useSpin } from '../wheel/useSpin'
import './Editor.css'
import { PresetIo } from './PresetIo'
import { SegmentList } from './SegmentList'
import { Transport } from './Transport'
import { TrickLibrary } from './TrickLibrary'

export function Editor() {
  const [preset, setPreset] = useState<Preset>(loadPreset)
  const [selectedTrickId, setSelectedTrickId] = useState<string | null>(null)

  // Every edit persists immediately; an open show window picks it up through
  // the storage event, so there is nothing to "apply".
  const update = useCallback((next: Preset) => {
    setPreset(next)
    savePreset(next)
  }, [])

  const resolved = useMemo(
    () => resolveTricks(preset.segments, preset.tricks, preset.spin.durationMs),
    [preset],
  )

  const conflicts = useMemo(
    () => findConflicts(preset.segments, preset.tricks, preset.spin.durationMs),
    [preset],
  )

  const spinConfig = useMemo<SpinConfig>(
    () => ({
      durationMs: preset.spin.durationMs,
      fullSpins: preset.spin.fullSpins,
      direction: 'cw',
      easing: preset.spin.easing,
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
            tricks={preset.tricks}
            selectedTrickId={selectedTrickId}
            onChange={(segments) => update({ ...preset, segments })}
            onSelectTrick={setSelectedTrickId}
          />
        </section>
        <section className="editor__column editor__column--center">
          <Wheel segments={shown} rotorRef={rotorRef} />
          <Transport
            segments={resolved.segments}
            morphs={resolved.morphs}
            durationMs={preset.spin.durationMs}
            isSpinning={isSpinning}
            onSpin={handleSpin}
            onScrub={handleScrub}
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
        </section>
      </div>
    </LabShell>
  )
}
