import { LabShell } from '@weasel-js/labkit'
import { useCallback, useMemo, useState } from 'react'
import { loadPreset, savePreset } from '../preset/storage'
import type { Preset } from '../preset/types'
import { resolveTricks } from '../tricks/resolve'
import { Wheel } from '../wheel/Wheel'
import './Editor.css'
import { SegmentList } from './SegmentList'

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
          <Wheel segments={resolved.segments} />
        </section>
        <section className="editor__column editor__column--right">
          <h2>Tricks</h2>
        </section>
      </div>
    </LabShell>
  )
}
