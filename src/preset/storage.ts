import { getRecipe } from '../tricks/registry'
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'
import { DEFAULT_PRESET } from './defaults'
import type { Preset } from './types'

export const PRESET_KEY = 'wod.preset.current'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readSegments(value: unknown): Segment[] {
  if (!Array.isArray(value)) return []
  const segments: Segment[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (typeof entry.id !== 'string' || typeof entry.label !== 'string') continue
    const weight =
      typeof entry.weight === 'number' && Number.isFinite(entry.weight)
        ? Math.max(0, entry.weight)
        : 0
    // Ids have to be unique: the wheel keys its arcs by segment id, and lookups
    // in spin and selection resolve to whichever duplicate comes first, so a
    // repeated id makes the pointer and the announced winner disagree.
    if (segments.some((existing) => existing.id === entry.id)) continue

    const segment: Segment = { id: entry.id, label: entry.label, weight }
    if (typeof entry.color === 'string') segment.color = entry.color
    segments.push(segment)
  }
  return segments
}

/** Positive and finite, or the fallback. */
function readPositive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * A stored trick that cannot run is disabled, never dropped and never thrown on.
 * The parent spec's rule is that the wheel never breaks the bit, and losing a
 * trick silently would be worse than showing it switched off.
 */
function readTricks(value: unknown, segments: Segment[]): Trick[] {
  if (!Array.isArray(value)) return []
  const tricks: Trick[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (typeof entry.id !== 'string' || typeof entry.recipe !== 'string') continue

    const recipe = getRecipe(entry.recipe)
    const params = isRecord(entry.params) ? entry.params : {}
    const runnable = recipe !== null && recipe.validate(params, segments) === null

    tricks.push({
      id: entry.id,
      name: typeof entry.name === 'string' ? entry.name : entry.id,
      recipe: entry.recipe as Trick['recipe'],
      params,
      enabled: runnable && entry.enabled === true,
    })
  }
  return tricks
}

export function parsePreset(raw: string | null): Preset {
  if (raw === null) return DEFAULT_PRESET

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return DEFAULT_PRESET
  }

  if (!isRecord(data) || data.version !== 1) return DEFAULT_PRESET

  const segments = readSegments(data.segments)
  const spin = isRecord(data.spin) ? data.spin : {}

  return {
    version: 1,
    name: typeof data.name === 'string' ? data.name : DEFAULT_PRESET.name,
    segments,
    tricks: readTricks(data.tricks, segments),
    spin: {
      // Must be positive, not merely finite. Element.animate() throws
      // synchronously on a negative duration, so a hand-edited preset would
      // crash the wheel at spin time — the exact failure this module exists to
      // prevent.
      durationMs: readPositive(spin.durationMs, DEFAULT_PRESET.spin.durationMs),
      fullSpins:
        typeof spin.fullSpins === 'number' && Number.isFinite(spin.fullSpins)
          ? Math.max(0, spin.fullSpins)
          : DEFAULT_PRESET.spin.fullSpins,
      easing: typeof spin.easing === 'string' ? spin.easing : DEFAULT_PRESET.spin.easing,
    },
  }
}

export function loadPreset(): Preset {
  try {
    return parsePreset(window.localStorage.getItem(PRESET_KEY))
  } catch {
    return DEFAULT_PRESET
  }
}

export function savePreset(preset: Preset): void {
  try {
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(preset))
  } catch {
    // Quota or a private-mode restriction. Editing keeps working in memory.
  }
}

/** Fires when another window writes the preset, so an open show page follows along. */
export function subscribePreset(onChange: (preset: Preset) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PRESET_KEY) return
    onChange(parsePreset(event.newValue))
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
