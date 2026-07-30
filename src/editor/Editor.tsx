import { LabShell } from '@weasel-js/labkit'
import { useMemo, useState } from 'react'
import { loadPreset } from '../preset/storage'
import type { Preset } from '../preset/types'
import { resolveTricks } from '../tricks/resolve'
import { Wheel } from '../wheel/Wheel'
import './Editor.css'

export function Editor() {
  const [preset] = useState<Preset>(loadPreset)

  const resolved = useMemo(
    () => resolveTricks(preset.segments, preset.tricks, preset.spin.durationMs),
    [preset],
  )

  return (
    <LabShell title="wod editor" header={<a href="#/">Show page</a>}>
      <div className="editor">
        <section className="editor__column editor__column--left">
          <h2>Segments</h2>
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
