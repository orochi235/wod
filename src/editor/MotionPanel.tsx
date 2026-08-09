import { NumberRow, PropertyPanel, PropertyRow, SelectRow } from '@weasel-js/labkit'
import { useLayoutEffect, useRef } from 'react'
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
 * Destructured rather than deleted or listed field by field: `delete` is
 * forbidden by Biome, and a field added to `Motion` later rides along on
 * `rest` without this function needing to know its name.
 */
function withoutSettle({ settle, ...rest }: Motion): Motion {
  return rest
}

export function MotionPanel({ motion, onChange }: MotionPanelProps) {
  // Written in a layout effect, not during render, matching FeedPanel's
  // `latest` ref for the same reason: a render that gets discarded rather
  // than committed must not leave behind a curve the panel never actually
  // held. Read here rather than `motion.settle?.curve`, which is undefined
  // for exactly one render of a backspace-then-retype — the one where the
  // field is empty and `motion.settle` is briefly absent.
  const lastCurve = useRef(motion.settle?.curve ?? DEFAULT_SETTLE_CURVE)
  useLayoutEffect(() => {
    if (motion.settle) lastCurve.current = motion.settle.curve
  })

  const editSettle = (text: string) => {
    // Only an empty field means absent. Anything else that will not parse is
    // a keystroke on the way to a number, and clearing the settle under it
    // would take the authored curve with it.
    if (text.trim() === '') {
      onChange(withoutSettle(motion))
      return
    }
    const ms = Number(text)
    if (!Number.isFinite(ms)) return
    onChange({ ...motion, settle: { ms: Math.max(0, ms), curve: lastCurve.current } })
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
