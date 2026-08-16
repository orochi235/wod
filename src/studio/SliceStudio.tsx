import { LabShell, PropertyPanel, SelectRow } from '@weasel-js/labkit'
import { useCallback, useMemo, useState } from 'react'
import { SlicePanel } from '../editor/SlicePanel'
import { loadPreset, savePreset } from '../preset/storage'
import type { Preset } from '../preset/types'
import { facesUsed } from '../slice/fonts/usage'
import { createMeasure } from '../slice/measure'
import { resolveInstance } from '../slice/registry'
import { flat } from '../wheel/themes/flat'
import { getTheme } from '../wheel/themes/registry'
import type { Segment } from '../wheel/types'
import { useFaces } from '../wheel/useFaces'
import './Studio.css'
import '../wheel/Wheel.css'
import { WedgePreview } from './WedgePreview'
import { ARC_STEPS, MAX_ARC_DEG, MIN_ARC_DEG, turnFraction } from './wedge'

/** What the studio previews when the preset carries no wedges of its own. */
const STAND_IN: Segment = { id: 'stand-in', label: 'Ada Lovelace', weight: 1, color: '#3b6ea5' }

const DEFAULT_SCRUB_DEG = 15

export function SliceStudio() {
  const [preset, setPreset] = useState<Preset>(loadPreset)
  const [scrubbed, setScrubbed] = useState(DEFAULT_SCRUB_DEG)
  const [segmentId, setSegmentId] = useState<string | null>(null)

  // Same contract as the editor's: every edit persists, and an open show window
  // picks it up through the storage event.
  const update = useCallback((next: Preset) => {
    setPreset(next)
    savePreset(next)
  }, [])

  const segments = preset.segments.length > 0 ? preset.segments : [STAND_IN]
  const segment = segments.find((entry) => entry.id === segmentId) ?? segments[0]
  const theme = getTheme(preset.theme ?? '') ?? flat
  // The wedge's own layout beats the one being edited, which is what makes an
  // overridden wedge visibly not answer to this page.
  const instance = resolveInstance(segment, preset.slice)

  const faces = useMemo(() => facesUsed([instance], theme.font), [instance, theme.font])
  const faceLoaded = useFaces(faces)
  // One measurer for every preview, so the string cache is shared across them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `faceLoaded` is the point — it is what retires the cache.
  const measure = useMemo(() => createMeasure(), [faceLoaded])

  const shared = { instance, segment, theme, measure }

  return (
    <LabShell
      title="wod slice studio"
      header={
        <>
          <a className="studio__exit" href="#/">
            ← Show page
          </a>
          <a className="studio__exit" href="#/edit">
            Editor
          </a>
        </>
      }
    >
      <div className="studio">
        <section className="studio__stage">
          <ul className="studio__gallery">
            {ARC_STEPS.map((step) => (
              <li className="studio__slot" key={step}>
                <WedgePreview {...shared} degrees={step} />
                <p className="studio__caption">{turnFraction(step)}</p>
              </li>
            ))}
            <li className="studio__slot studio__slot--scrubbed">
              <WedgePreview {...shared} degrees={scrubbed} />
              <p className="studio__caption">{scrubbed}°</p>
              <input
                className="studio__scrub"
                aria-label="Scrubbed arc width"
                type="range"
                min={MIN_ARC_DEG}
                max={MAX_ARC_DEG}
                step={1}
                value={scrubbed}
                onChange={(event) => setScrubbed(Number(event.target.value))}
              />
            </li>
          </ul>
        </section>
        <section className="studio__controls">
          <PropertyPanel title="Wedge">
            <SelectRow
              label="Preview on"
              value={segment.id}
              options={segments.map((entry) => ({ value: entry.id, label: entry.label }))}
              onChange={setSegmentId}
            />
          </PropertyPanel>
          <SlicePanel slice={preset.slice} onChange={(slice) => update({ ...preset, slice })} />
        </section>
      </div>
    </LabShell>
  )
}
