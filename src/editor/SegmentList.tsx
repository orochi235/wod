import { PropertyPanel } from '@weasel-js/labkit'
import { Button } from '@weasel-js/labkit/weasel-ui'
import { wedgeOwners } from '../tricks/resolve'
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'

export type SegmentListProps = {
  segments: Segment[]
  tricks: Trick[]
  /** Highlights the ghost row belonging to the trick under edit. */
  selectedTrickId: string | null
  onChange: (segments: Segment[]) => void
  onSelectTrick: (trickId: string) => void
}

function nextId(segments: Segment[]): string {
  let n = segments.length + 1
  while (segments.some((segment) => segment.id === `seg${n}`)) n += 1
  return `seg${n}`
}

export function SegmentList({
  segments,
  tricks,
  selectedTrickId,
  onChange,
  onSelectTrick,
}: SegmentListProps) {
  const owners = wedgeOwners(tricks)

  const replace = (index: number, patch: Partial<Segment>) => {
    onChange(segments.map((segment, i) => (i === index ? { ...segment, ...patch } : segment)))
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= segments.length) return
    const next = [...segments]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  return (
    <PropertyPanel title="Segments" className="segment-list">
      <ul className="segment-list__rows">
        {segments.map((segment, index) => (
          <li className="segment-list__row" key={segment.id}>
            <input
              className="segment-list__label"
              aria-label={`Label of ${segment.label}`}
              value={segment.label}
              onChange={(event) => replace(index, { label: event.target.value })}
            />
            <input
              className="segment-list__weight"
              type="number"
              min={0}
              step={0.1}
              aria-label={`Weight of ${segment.label}`}
              value={segment.weight}
              onChange={(event) => {
                const weight = Number.parseFloat(event.target.value)
                replace(index, { weight: Number.isFinite(weight) ? Math.max(0, weight) : 0 })
              }}
            />
            <input
              className="segment-list__color"
              type="color"
              aria-label={`Color of ${segment.label}`}
              value={segment.color ?? '#888888'}
              onChange={(event) => replace(index, { color: event.target.value })}
            />
            <button
              type="button"
              aria-label={`Move ${segment.label} down`}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              className="segment-list__delete"
              type="button"
              aria-label={`Delete ${segment.label}`}
              onClick={() => onChange(segments.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </li>
        ))}

        {[...owners.entries()].map(([segmentId, trick]) => (
          <li
            className={`segment-list__row segment-list__row--ghost${
              trick.id === selectedTrickId ? ' segment-list__row--active' : ''
            }`}
            key={segmentId}
          >
            <button
              className="segment-list__ghost-button"
              type="button"
              aria-label={`Owned by ${trick.name}`}
              onClick={() => onSelectTrick(trick.id)}
            >
              <span className="segment-list__label-text">
                {String(trick.params.wedgeLabel ?? segmentId)}
              </span>
              <span className="segment-list__owner">↳ {trick.name}</span>
            </button>
            <span className="segment-list__weight-readout">0</span>
          </li>
        ))}
      </ul>

      <Button
        onClick={() => onChange([...segments, { id: nextId(segments), label: 'New', weight: 1 }])}
      >
        + Add segment
      </Button>
    </PropertyPanel>
  )
}
