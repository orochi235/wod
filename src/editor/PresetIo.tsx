import { parsePreset } from '../preset/storage'
import type { Preset } from '../preset/types'

export type PresetIoProps = {
  preset: Preset
  onImport: (preset: Preset) => void
}

export function PresetIo({ preset, onImport }: PresetIoProps) {
  const json = JSON.stringify(preset, null, 2)
  const href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`

  return (
    <div className="preset-io">
      <a href={href} download={`wod-${preset.name}.json`}>
        Export
      </a>
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
