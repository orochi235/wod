import { PropertyPanel } from '@weasel-js/labkit'
import type { FeedItem, ItemOverride } from '../feed/types'

export type OverridesPanelProps = {
  items: FeedItem[]
  overrides: Record<string, ItemOverride>
  onChange: (overrides: Record<string, ItemOverride>) => void
}

/** Stands in for an unset color. Never stored — the swatch is dimmed to say so. */
const PLACEHOLDER_COLOR = '#888888'

/**
 * Never a bare `overrides[id]`, for the reason composeBase spells out: an item
 * id of 'constructor' or '__proto__' resolves up the prototype chain to
 * something that is not an override.
 */
function overrideOf(overrides: Record<string, ItemOverride>, id: string): ItemOverride {
  return Object.hasOwn(overrides, id) ? overrides[id] : {}
}

function Row({
  id,
  label,
  override,
  onPatch,
  onForget,
}: {
  id: string
  label: string
  override: ItemOverride
  onPatch: (patch: ItemOverride) => void
  onForget: () => void
}) {
  return (
    <li className="overrides__row">
      <span className="overrides__label">{label}</span>
      <input
        type="checkbox"
        aria-label={`Exclude ${label}`}
        checked={override.excluded === true}
        // Unchecking clears the key rather than storing false. A stored false
        // says nothing an absent field does not already say, and it would keep
        // the override alive — parking a row in the Known list for someone who
        // carries no override at all.
        onChange={(event) => onPatch({ excluded: event.target.checked ? true : undefined })}
      />
      <input
        className="overrides__weight"
        type="number"
        min={0}
        step={0.5}
        aria-label={`Weight of ${label}`}
        // Rendered straight from the stored number, with no draft of the typed
        // text: a number input reports partial input ("1.", "-") as an empty
        // value, and react-dom compares this one's value numerically, so neither
        // "1.50" nor a half-typed decimal is written back over the operator.
        value={override.weight ?? ''}
        placeholder="default"
        onChange={(event) => {
          const weight = Number.parseFloat(event.target.value)
          // An empty field is not weight 0 — it hands the wedge back to the
          // feed default, which is what an absent field means everywhere else.
          onPatch({ weight: Number.isFinite(weight) ? Math.max(0, weight) : undefined })
        }}
      />
      <input
        // An <input type="color"> always holds a color, so an unset row shows
        // one it did not choose. Dimming it is what separates "no override"
        // from a deliberate grey.
        className={`overrides__color${override.color === undefined ? ' overrides__color--unset' : ''}`}
        type="color"
        aria-label={`Color of ${label}`}
        value={override.color ?? PLACEHOLDER_COLOR}
        onChange={(event) => onPatch({ color: event.target.value })}
      />
      <button
        type="button"
        // The swatch has no way to say "nothing", so clearing needs its own
        // control — unlike excluded, which unsets by being unchecked.
        aria-label={`Clear color of ${label}`}
        disabled={override.color === undefined}
        onClick={() => onPatch({ color: undefined })}
      >
        ⌫
      </button>
      {/* Same convention as the clear-color control beside it: a button that
          would do nothing says so rather than writing an equal record back. */}
      <button
        type="button"
        aria-label={`Forget ${id}`}
        disabled={Object.keys(override).length === 0}
        onClick={onForget}
      >
        ×
      </button>
    </li>
  )
}

export function OverridesPanel({ items, overrides, onChange }: OverridesPanelProps) {
  // Everything with a saved override that is not in the room. This is what makes
  // a joke editable at 11pm with no meeting running.
  const known = Object.keys(overrides).filter((id) => !items.some((item) => item.id === id))

  const forget = (id: string) => {
    const next = { ...overrides }
    delete next[id]
    onChange(next)
  }

  const patch = (id: string, next: ItemOverride) => {
    const merged: ItemOverride = { ...overrideOf(overrides, id), ...next }
    // An undefined field means "use the feed default", so it is removed rather
    // than stored — otherwise clearing a weight would pin it at undefined.
    for (const key of Object.keys(merged) as (keyof ItemOverride)[]) {
      if (merged[key] === undefined) delete merged[key]
    }
    // An override with nothing left in it is the same as no override — but only
    // a present item can afford to lose it, because the feed keeps drawing the
    // row either way. For an absentee the override *is* the row, so dropping it
    // here would delete the row out from under the operator the moment they
    // clear a field to retype it. Theirs waits for Forget; readOverrides drops
    // the empty husk on the next load, so nothing accumulates.
    if (Object.keys(merged).length === 0 && items.some((item) => item.id === id)) {
      forget(id)
      return
    }
    onChange({ ...overrides, [id]: merged })
  }

  return (
    <PropertyPanel title="Attendees">
      <fieldset className="overrides__group">
        <legend>Present</legend>
        <ul className="overrides__list">
          {items.map((item) => (
            <Row
              key={item.id}
              id={item.id}
              label={item.label}
              override={overrideOf(overrides, item.id)}
              onPatch={(next) => patch(item.id, next)}
              onForget={() => forget(item.id)}
            />
          ))}
        </ul>
      </fieldset>

      <fieldset className="overrides__group">
        <legend>Known</legend>
        <ul className="overrides__list">
          {known.map((id) => (
            // Labelled by id: the label came from the feed and left with them.
            <Row
              key={id}
              id={id}
              label={id}
              override={overrideOf(overrides, id)}
              onPatch={(next) => patch(id, next)}
              onForget={() => forget(id)}
            />
          ))}
        </ul>
      </fieldset>
    </PropertyPanel>
  )
}
