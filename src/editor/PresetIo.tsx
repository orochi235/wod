import { SAMPLES, getSample } from '../preset/samples'
import { parsePreset } from '../preset/storage'
import type { Preset } from '../preset/types'

export type PresetIoProps = {
  preset: Preset
  onImport: (preset: Preset) => void
  /** Export writes the tricks out in full, so a locked editor cannot offer it. */
  showExport: boolean
}

export function PresetIo({ preset, onImport, showExport }: PresetIoProps) {
  const json = JSON.stringify(preset, null, 2)
  const href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`

  return (
    <div className="preset-io">
      {showExport ? (
        <a href={href} download={`wod-${preset.name}.json`}>
          Export
        </a>
      ) : null}
      <label className="preset-io__import">
        <span>Import</span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            // Same defensive parser as load, so a hand-edited or stale file
            // degrades instead of throwing.
            onImport(parsePreset(await file.text()))
            event.target.value = ''
          }}
        />
      </label>
      <label className="preset-io__sample">
        <span>Sample</span>
        {/* Held at the placeholder: loading is the act, and a select that keeps
            the last one loaded reads as the wheel currently on screen. */}
        <select
          value=""
          onChange={(event) => {
            const sample = getSample(event.target.value)
            // Through the same parser an import takes, so a sample cannot ship
            // a shape the app would not accept from a file — and the editor
            // gets a copy of its own to edit rather than the module's.
            if (sample) onImport(parsePreset(JSON.stringify(sample.preset)))
          }}
        >
          <option value="">Load a sample…</option>
          {SAMPLES.map((sample) => (
            <option key={sample.id} value={sample.id}>
              {sample.name} — {sample.about}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
