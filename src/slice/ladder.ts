import { budget } from './fit'
import type { ContentTransform, FitSpec, Measure, Orientation, Placement } from './types'

export type Rung = { orientation: Orientation; content: ContentTransform }

export type LadderId = 'shrinkNameInitials' | 'shrinkEllipsis' | 'shrinkOnly' | 'noShrink'

export type Resolved = Placement & { content: ContentTransform }

const rung = (orientation: Orientation, content: ContentTransform): Rung => ({
  orientation,
  content,
})

export const LADDERS: Record<LadderId, Rung[]> = {
  shrinkNameInitials: [
    rung('curved', 'full'),
    rung('tangential', 'full'),
    rung('radial', 'full'),
    rung('radial', 'firstName'),
    rung('curved', 'initials'),
    rung('radial', 'initials'),
  ],
  shrinkEllipsis: [
    rung('curved', 'full'),
    rung('tangential', 'full'),
    rung('radial', 'full'),
    rung('radial', 'ellipsis'),
  ],
  shrinkOnly: [rung('curved', 'full'), rung('tangential', 'full'), rung('radial', 'full')],
  noShrink: [rung('curved', 'full')],
}

export const LADDER_OPTIONS: { value: LadderId; label: string }[] = [
  { value: 'shrinkNameInitials', label: 'Shrink → first name → initials' },
  { value: 'shrinkEllipsis', label: 'Shrink → ellipsis' },
  { value: 'shrinkOnly', label: 'Shrink only' },
  { value: 'noShrink', label: 'Never shrink' },
]

export function isLadderId(value: unknown): value is LadderId {
  return typeof value === 'string' && Object.hasOwn(LADDERS, value)
}

export function applyTransform(content: ContentTransform, text: string): string {
  switch (content) {
    case 'firstName':
      return text.split(/\s+/)[0] ?? text
    // Nothing, not the whole word, for a one-word label: a composition pairing
    // this with firstName would otherwise set the same word twice.
    case 'lastName': {
      const words = text.split(/\s+/).filter((word) => word !== '')
      return words.length > 1 ? words[words.length - 1] : ''
    }
    case 'initials':
      return text
        .split(/\s+/)
        .map((part) => part[0] ?? '')
        .join('')
        .toUpperCase()
    // Ellipsis needs a budget, so the walk resolves it; here it is a no-op.
    default:
      return text
  }
}

/** The longest prefix that fits `length` at `size`, with an ellipsis appended. */
export function ellipsize(text: string, length: number, size: number, measure: Measure): string {
  if (measure(text, size) <= length) return text

  let best = '…'
  for (let n = 1; n <= text.length; n++) {
    const candidate = `${text.slice(0, n)}…`
    if (measure(candidate, size) > length) break
    best = candidate
  }
  return best
}

/**
 * Take the first rung whose text fits. Returns null when every rung fails,
 * which is the layout's cue to draw no text at all rather than an unreadable one.
 */
export function walkLadder(
  text: string,
  rungs: Rung[],
  spec: Omit<FitSpec, 'text' | 'orientation'>,
  fit: (spec: FitSpec) => Placement | null,
  measure: Measure,
): Resolved | null {
  for (const step of rungs) {
    const attempt = { ...spec, orientation: step.orientation }
    const candidate =
      step.content === 'ellipsis'
        ? ellipsize(text, budget(attempt).length, spec.minSize, measure)
        : applyTransform(step.content, text)
    if (candidate.length === 0) continue

    const placed = fit({ ...attempt, text: candidate })
    if (placed) return { ...placed, content: step.content }
  }
  return null
}
