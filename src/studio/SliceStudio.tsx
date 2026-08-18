import { CheckboxRow, ColorRow, LabShell, PropertyPanel, SelectRow } from '@weasel-js/labkit'
import { useCallback, useMemo, useState } from 'react'
import { BreakpointPanel } from '../editor/BreakpointPanel'
import { SlicePanel } from '../editor/SlicePanel'
import { loadPreset, savePreset } from '../preset/storage'
import type { Preset } from '../preset/types'
import { sliceAt } from '../slice/breakpoints'
import { facesUsed } from '../slice/fonts/usage'
import { createMeasure } from '../slice/measure'
import { getSlice, instancesUsed, resolveInstance } from '../slice/registry'
import { turnFraction } from '../slice/turns'
import { partOn } from '../wheel/theme'
import { flat } from '../wheel/themes/flat'
import { getTheme } from '../wheel/themes/registry'
import type { Segment } from '../wheel/types'
import { useFaces } from '../wheel/useFaces'
import './Studio.css'
import '../wheel/Wheel.css'
import { WedgePreview } from './WedgePreview'
import {
  ARC_STEPS,
  FALLBACK_HUB_RADIUS,
  MAX_ARC_DEG,
  MIN_ARC_DEG,
  PREVIEW_FILL,
  WIDE_ARC_STEPS,
  previewHubRadius,
} from './wedge'

/** What the studio previews when the preset carries no wedges of its own. */
const STAND_IN: Segment = { id: 'stand-in', label: 'Ada Lovelace', weight: 1, color: '#3b6ea5' }

// Off the step list on purpose, so all six previews show a different width.
const DEFAULT_SCRUB_DEG = 10

export function SliceStudio() {
  const [preset, setPreset] = useState<Preset>(loadPreset)
  const [scrubbed, setScrubbed] = useState(DEFAULT_SCRUB_DEG)
  const [segmentId, setSegmentId] = useState<string | null>(null)
  // Null follows the wedge's own color, so picking a different segment still
  // repaints until someone actually chooses one here.
  const [chosenFill, setChosenFill] = useState<string | null>(null)
  // Null follows the look, which is the honest default; the toggle is for
  // judging the tip against a cap the current look happens not to wear.
  const [clipHub, setClipHub] = useState<boolean | null>(null)
  const [showBands, setShowBands] = useState(false)

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
  const instanceAt = (degrees: number) =>
    resolveInstance(segment, preset.slice, preset.breakpoints, degrees / 360)

  /**
   * The layout a breakpoint put on this width, or null where none did — so a
   * caption stays a bare width until breakpoints are in play. Null for an
   * overridden wedge too: the override won, so naming a breakpoint there would
   * name something the preview is not drawing.
   */
  const breakpointAt = (degrees: number): string | null => {
    if (segment.slice) return null
    const matched = sliceAt(preset.breakpoints, degrees / 360)
    return matched ? (getSlice(matched.id)?.name ?? null) : null
  }

  const faces = useMemo(
    () => facesUsed(instancesUsed([segment], preset.slice, preset.breakpoints), theme.font),
    [segment, preset.slice, preset.breakpoints, theme.font],
  )
  const faceLoaded = useFaces(faces)
  // One measurer for every preview, so the string cache is shared across them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `faceLoaded` is the point — it is what retires the cache.
  const measure = useMemo(() => createMeasure(), [faceLoaded])

  const fill = chosenFill ?? segment.color ?? PREVIEW_FILL
  const themeHub = partOn(theme, 'hub') ? theme.metrics.hubRadius : 0
  const clipped = clipHub ?? themeHub > 0
  const hub = clipped ? previewHubRadius(themeHub || FALLBACK_HUB_RADIUS) : 0
  const shared = { segment, theme, measure, fill, hub, showBands }

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
            {ARC_STEPS.map((step) => {
              const named = breakpointAt(step)
              return (
                <li className="studio__slot" key={step}>
                  <WedgePreview {...shared} instance={instanceAt(step)} degrees={step} />
                  <p className="studio__caption">
                    {turnFraction(step)}
                    {named && <span className="studio__resolved">{named}</span>}
                  </p>
                </li>
              )
            })}
            {WIDE_ARC_STEPS.map((step) => {
              const named = breakpointAt(step)
              return (
                <li className="studio__slot" key={step}>
                  <WedgePreview
                    {...shared}
                    instance={instanceAt(step)}
                    degrees={step}
                    fitDegrees={step}
                  />
                  <p className="studio__caption">
                    {turnFraction(step)}
                    {named && <span className="studio__resolved">{named}</span>}
                  </p>
                </li>
              )
            })}
            <li className="studio__slot studio__slot--scrubbed studio__slot--fill">
              <WedgePreview {...shared} instance={instanceAt(scrubbed)} degrees={scrubbed} />
              <p className="studio__caption">
                {scrubbed}°
                {breakpointAt(scrubbed) && (
                  <span className="studio__resolved">{breakpointAt(scrubbed)}</span>
                )}
              </p>
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
            <ColorRow label="Wedge color" value={fill} onChange={setChosenFill} />
            <CheckboxRow label="Clip the hub" value={clipped} onChange={setClipHub} />
            <CheckboxRow label="Show the room" value={showBands} onChange={setShowBands} />
          </PropertyPanel>
          <SlicePanel slice={preset.slice} onChange={(slice) => update({ ...preset, slice })} />
          <BreakpointPanel
            breakpoints={preset.breakpoints}
            wheelSlice={preset.slice}
            onChange={(breakpoints) => update({ ...preset, breakpoints })}
          />
        </section>
      </div>
    </LabShell>
  )
}
