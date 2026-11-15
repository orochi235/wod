# TODO

- **Preset decoding repairs silently.** `parsePreset` in `src/preset/storage.ts` falls back field by field:
  unknown registry ids are disabled or dropped, unreadable breakpoints vanish, and a file from a newer build
  or with broken JSON comes back as `DEFAULT_PRESET`. An import through `src/editor/PresetIo.tsx` therefore
  can load a blank or trimmed show with nothing on screen saying so. Wants `parsePreset` to return
  diagnostics beside the preset (what was repaired, what this build did not understand), a strict path for
  import that shows them, and the forgiving path kept for local recovery. `loadPreset` already copies an
  unreadable stored preset to `wod.preset.unreadable` before the default replaces it. (filed 2026-11-15
  from automated review)
