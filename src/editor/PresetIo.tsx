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
    </div>
  )
}
