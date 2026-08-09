import { NumberRow, PropertyPanel, PropertyRow, SelectRow } from '@weasel-js/labkit'
import type { Motion } from '../preset/types'
import { DEFAULT_SETTLE_CURVE } from '../wheel/curve'
import type { Direction } from '../wheel/types'

export type MotionPanelProps = {
  motion: Motion
  onChange: (motion: Motion) => void
}

const DIRECTIONS: ReadonlyArray<{ value: Direction; label: string }> = [
  { value: 'cw', label: 'Clockwise' },
  { value: 'ccw', label: 'Counter-clockwise' },
]

/**
 * Rebuilt field by field rather than deleted from a copy: Biome's recommended
 * rules forbid `delete`, and an explicit shape is what makes "absent" legible
 * next to a settle of zero, which is a different animation.
 */
function withoutSettle(motion: Motion): Motion {
  return {
    durationMs: motion.durationMs,
    turns: motion.turns,
    direction: motion.direction,
    easing: motion.easing,
  }
}

export function MotionPanel({ motion, onChange }: MotionPanelProps) {
  const editSettle = (text: string) => {
    const ms = Number.parseInt(text, 10)
    if (!Number.isFinite(ms)) {
      onChange(withoutSettle(motion))
      return
    }
    onChange({
      ...motion,
      // The curve survives a length edit. Nothing in this panel can author one
      // yet, but an imported preset or a hand edit can, and retyping a number
      // must not quietly throw it away.
      settle: { ms: Math.max(0, ms), curve: motion.settle?.curve ?? DEFAULT_SETTLE_CURVE },
    })
  }

  return (
    <PropertyPanel title="Motion">
      {/* Floored at 1, not 0: Element.animate() throws synchronously on a
          negative duration, and the parser only guards data arriving by import. */}
      <NumberRow
        label="Duration (ms)"
        min={1}
        step={100}
        value={motion.durationMs}
        onChange={(next) =>
          onChange({ ...motion, durationMs: Number.isFinite(next) ? Math.max(1, next) : 1 })
        }
      />

      <NumberRow
        label="Turns"
        min={0}
        value={motion.turns}
        onChange={(next) =>
          onChange({ ...motion, turns: Number.isFinite(next) ? Math.max(0, next) : 0 })
        }
      />

      <SelectRow
        label="Direction"
        value={motion.direction}
        options={DIRECTIONS}
        onChange={(next) => onChange({ ...motion, direction: next })}
      />

      {/* A raw input rather than NumberRow: an empty field has no number to
          hold, and empty is how the operator says "no settle phase at all". */}
      <PropertyRow label="Settle (ms)">
        <input
          type="number"
          min={0}
          step={50}
          aria-label="Settle (ms)"
          value={motion.settle ? motion.settle.ms : ''}
          onChange={(event) => editSettle(event.target.value)}
        />
      </PropertyRow>
    </PropertyPanel>
  )
}
