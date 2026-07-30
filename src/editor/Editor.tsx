import { LabShell } from '@weasel-js/labkit'
import { useCallback, useMemo, useState } from 'react'
import { loadPreset, savePreset } from '../preset/storage'
import type { Preset } from '../preset/types'
import { findConflicts } from '../tricks/conflicts'
import { resolveTricks } from '../tricks/resolve'
import { Wheel } from '../wheel/Wheel'
import type { Segment } from '../wheel/types'
import { useSpin } from '../wheel/useSpin'
import './Editor.css'
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

  const spinConfig = useMemo(
    () => ({
      durationMs: preset.spin.durationMs,
      fullSpins: preset.spin.fullSpins,
      easing: preset.spin.easing,
      morphs: resolved.morphs,
    }),
    [preset.spin, resolved.morphs],
  )

  const { displaySegments, isSpinning, spin, rotorRef } = useSpin(resolved.segments, spinConfig)
  const [scrubbed, setScrubbed] = useState<Segment[] | null>(null)

  // A running spin owns the geometry; otherwise the scrubber does.
  const shown = isSpinning ? displaySegments : (scrubbed ?? resolved.segments)

  return (
    <LabShell title="wod editor" header={<a href="#/">Show page</a>}>
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
            onSpin={() => spin()}
            onScrub={setScrubbed}
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
