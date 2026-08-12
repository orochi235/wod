import { PropertyPanel } from '@weasel-js/labkit'
import { Button } from '@weasel-js/labkit/weasel-ui'
import type { Composition } from '../compose/types'
import { wedgeOwners } from '../tricks/resolve'
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'
import { RevealEditor } from './RevealEditor'

export type SegmentListProps = {
  /** The authored wedges, the only ones these rows may edit. */
  segments: Segment[]
  /** Everything already on the wheel before tricks, so a ghost row cannot
      duplicate a wedge the composition already produced. */
  base: Composition
  tricks: Trick[]
  /** Ghost rows name the trick that owns a wedge, which a locked editor withholds. */
  showOwners: boolean
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
  base,
  tricks,
  showOwners,
  selectedTrickId,
  onChange,
  onSelectTrick,
}: SegmentListProps) {
  const owners = showOwners ? wedgeOwners(base, tricks) : new Map<string, Trick>()

  // Deletes keys the patch set to undefined, so removing a reveal leaves no
  // `reveal: undefined` behind for the serializer to carry.
  const replace = (index: number, patch: Partial<Segment>) => {
    onChange(
      segments.map((segment, i) => {
        if (i !== index) return segment
        const merged = { ...segment, ...patch }
        for (const key of Object.keys(patch) as (keyof Segment)[]) {
          if (merged[key] === undefined) delete merged[key]
        }
        return merged
      }),
    )
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
              aria-label={`Move ${segment.label} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${segment.label} down`}
              disabled={index === segments.length - 1}
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
            <RevealEditor
              name={segment.label}
              reveal={segment.reveal}
              onChange={(reveal) => replace(index, { reveal })}
            />
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
                {/* Never fall back to the segment id — that would put the
                    internal 'trickId:wedge' string on screen. */}
                {typeof trick.params.wedgeLabel === 'string' && trick.params.wedgeLabel !== ''
                  ? trick.params.wedgeLabel
                  : 'unnamed wedge'}
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
