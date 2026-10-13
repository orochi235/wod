import { PropertyField, PropertyGroup } from '@weasel-js/labkit'
import { DEFAULT_LEADING, DEFAULT_TRACKING } from '../slice/fit'
import { DEFAULT_PADDING } from '../slice/glyphRun'
import {
  DEFAULT_PART,
  LEADING_RANGE,
  PAD_TAPER_RANGE,
  PADDING_RANGE,
  readParts,
  TRACKING_RANGE,
} from '../slice/parts'
import type { ContentTransform, Orientation, PartContent, SlicePart } from '../slice/types'
import { FontField } from './FontField'
import { SliderField } from './SliderField'

export type PartsFieldProps = {
  label: string
  max: number
  value: unknown
  onChange: (parts: SlicePart[]) => void
}

const NONE = ''

const CONTENTS: { value: string; label: string; make: () => PartContent }[] = [
  { value: 'label', label: 'The wedge label', make: () => ({ from: 'label' }) },
  { value: 'text', label: 'An authored word', make: () => ({ from: 'text', value: '' }) },
  { value: 'media', label: "The wedge's picture", make: () => ({ from: 'media' }) },
  { value: 'weight', label: 'Its weight', make: () => ({ from: 'derived', value: 'weight' }) },
  { value: 'index', label: 'Its number', make: () => ({ from: 'derived', value: 'index' }) },
  {
    value: 'position',
    label: 'Its number of the total',
    make: () => ({ from: 'derived', value: 'position' }),
  },
]

const contentValue = (content: PartContent): string =>
  content.from === 'derived' ? content.value : content.from

const ORIENTATIONS: { value: Orientation; label: string }[] = [
  { value: 'stacked', label: 'Stacked — upright, down the radius' },
  { value: 'taperedRadial', label: 'Tapered — turned, along the radius' },
  { value: 'archedRim', label: 'Arched — on an arc inside the rim' },
  { value: 'curved', label: 'Curved — one run along the arc' },
  { value: 'tangential', label: 'Tangential — one run across the wedge' },
  { value: 'radial', label: 'Radial — one run along the radius' },
]

const TRANSFORMS: { value: ContentTransform; label: string }[] = [
  { value: 'full', label: 'Not at all' },
  { value: 'firstName', label: 'First name' },
  { value: 'lastName', label: 'Last name' },
  { value: 'initials', label: 'Initials' },
  { value: 'digits', label: 'Digits only' },
  { value: 'ellipsis', label: 'Cut with an ellipsis' },
]

const STRETCHES = [
  { value: 'none', label: 'None' },
  { value: 'fill', label: 'Fill the wedge' },
  { value: 'custom', label: 'A chosen amount' },
]

const SHAPES = [
  { value: 'glyphs', label: 'Letter by letter' },
  { value: 'outline', label: 'One warped shape' },
]

const SHRINKS = [
  { value: 'proportional', label: 'The whole letter' },
  // Not "its width": the squeeze is always the axis that crosses the wedge, and
  // a quarter-turned run crosses it with its height.
  { value: 'condense', label: 'Across the wedge only' },
]

const stretchValue = (part: SlicePart): string =>
  typeof part.stretch === 'number' ? 'custom' : (part.stretch ?? 'none')

export function PartsField({ label, max, value, onChange }: PartsFieldProps) {
  // The stored list is uncapped; the editor only ever shows `max` of it.
  const parts = readParts(value).slice(0, max)
  const slots: (SlicePart | undefined)[] = Array.from({ length: max }, (_, i) => parts[i])

  const write = (next: (SlicePart | undefined)[]) =>
    onChange(next.filter((part): part is SlicePart => part !== undefined))

  const replace = (index: number, part: SlicePart | undefined) =>
    write(slots.map((slot, i) => (i === index ? part : slot)))

  const edit = (index: number, patch: Partial<SlicePart>) => {
    const part = slots[index]
    if (part) replace(index, { ...part, ...patch })
  }

  const setContent = (index: number, choice: string) => {
    if (choice === NONE) {
      replace(index, undefined)
      return
    }
    const entry = CONTENTS.find((candidate) => candidate.value === choice)
    if (!entry) return
    replace(index, { ...(slots[index] ?? DEFAULT_PART), content: entry.make() })
  }

  // Cleared rather than set to undefined: a stored part carries the key only
  // when it names a face.
  const setFont = (index: number, font: string | undefined) => {
    const part = slots[index]
    if (!part) return
    const { font: cleared, ...rest } = part
    replace(index, font ? { ...rest, font } : rest)
  }

  // Cleared rather than set to undefined, as `setFont` is: a part carries the
  // key only when it overrides the wedge's ink.
  const setColor = (index: number, color: string | undefined) => {
    const part = slots[index]
    if (!part) return
    const { color: cleared, ...rest } = part
    replace(index, color ? { ...rest, color } : rest)
  }

  const setStretch = (index: number, choice: string) => {
    if (choice === 'custom') edit(index, { stretch: 1.5 })
    else if (choice === 'fill') edit(index, { stretch: 'fill' })
    else edit(index, { stretch: 'none' })
  }

  // Written back ordered, so dragging one edge past the other narrows the band
  // rather than inverting it.
  const setBand = (index: number, edge: 0 | 1, next: number) => {
    const part = slots[index]
    if (!part) return
    const [a, b] = edge === 0 ? [next, part.band[1]] : [part.band[0], next]
    edit(index, { band: [Math.min(a, b), Math.max(a, b)] })
  }

  return (
    <>
      {slots.map((part, index) => (
        <PropertyGroup
          // A slot is a fixed position, not an entry in a reorderable list.
          // biome-ignore lint/suspicious/noArrayIndexKey: the index is the identity.
          key={index}
          title={`${label} ${index + 1}`}
          pack="pairs"
        >
          <PropertyField
            kind="enum"
            label="Content"
            value={part ? contentValue(part.content) : NONE}
            options={[
              { value: NONE, label: 'None' },
              ...CONTENTS.map((entry) => ({ value: entry.value, label: entry.label })),
            ]}
            onChange={(next) => setContent(index, next)}
          />
          {part?.content.from === 'text' ? (
            <PropertyField
              kind="string"
              label="Word"
              value={part.content.value}
              onChange={(next) => edit(index, { content: { from: 'text', value: next } })}
            />
          ) : null}
          {part?.content.from === 'label' ? (
            <PropertyField
              kind="enum"
              label="Shorten"
              value={part.content.transform ?? 'full'}
              options={TRANSFORMS}
              onChange={(next) =>
                edit(index, { content: { from: 'label', transform: next as ContentTransform } })
              }
            />
          ) : null}
          {part ? (
            <>
              <PropertyField
                kind="enum"
                label="Orientation"
                value={part.orientation}
                options={ORIENTATIONS}
                onChange={(next) => edit(index, { orientation: next as Orientation })}
              />
              <SliderField
                label="Inner edge"
                min={0}
                max={1}
                step={0.01}
                value={part.band[0]}
                onChange={(next) => setBand(index, 0, next)}
              />
              <SliderField
                label="Outer edge"
                min={0}
                max={1}
                step={0.01}
                value={part.band[1]}
                onChange={(next) => setBand(index, 1, next)}
              />
              <PropertyField
                kind="enum"
                label="Direction"
                value={part.direction ?? 'rimInward'}
                options={[
                  { value: 'rimInward', label: 'Rim inward' },
                  { value: 'hubOutward', label: 'Hub outward' },
                ]}
                onChange={(next) => edit(index, { direction: next as 'rimInward' | 'hubOutward' })}
              />
              <PropertyField
                kind="boolean"
                label="Grow toward the rim"
                value={part.fan ?? true}
                onChange={(next) => edit(index, { fan: next })}
              />
              <PropertyField
                kind="boolean"
                label="All caps"
                value={part.caps ?? false}
                onChange={(next) => edit(index, { caps: next })}
              />
              <PropertyField
                kind="enum"
                label="Stretch"
                value={stretchValue(part)}
                options={STRETCHES}
                onChange={(next) => setStretch(index, next)}
              />
              {typeof part.stretch === 'number' ? (
                <SliderField
                  label="Stretch amount"
                  min={1}
                  max={3}
                  step={0.05}
                  value={part.stretch}
                  onChange={(next) => edit(index, { stretch: next })}
                />
              ) : null}
              <PropertyField
                kind="enum"
                label="When it must shrink"
                value={part.shrink ?? 'proportional'}
                options={SHRINKS}
                onChange={(next) => edit(index, { shrink: next as SlicePart['shrink'] })}
              />
              <SliderField
                label="Max size"
                min={10}
                max={48}
                step={1}
                value={part.maxSize ?? 40}
                onChange={(next) => edit(index, { maxSize: next })}
              />
              <SliderField
                label="Side padding"
                min={PADDING_RANGE[0]}
                max={PADDING_RANGE[1]}
                step={0.01}
                value={part.padding ?? DEFAULT_PADDING}
                onChange={(next) => edit(index, { padding: next })}
              />
              <SliderField
                label="Padding taper"
                min={PAD_TAPER_RANGE[0]}
                max={PAD_TAPER_RANGE[1]}
                step={0.05}
                value={part.padTaper ?? 0}
                onChange={(next) => edit(index, { padTaper: next })}
              />
              <SliderField
                label="Tracking"
                min={TRACKING_RANGE[0]}
                max={TRACKING_RANGE[1]}
                step={0.01}
                value={part.tracking ?? DEFAULT_TRACKING}
                onChange={(next) => edit(index, { tracking: next })}
              />
              <SliderField
                label="Leading"
                min={LEADING_RANGE[0]}
                max={LEADING_RANGE[1]}
                step={0.05}
                value={part.leading ?? DEFAULT_LEADING}
                onChange={(next) => edit(index, { leading: next })}
              />
              <PropertyField
                kind="boolean"
                label="Its own color"
                value={part.color !== undefined}
                onChange={(next) => setColor(index, next ? '#ffffff' : undefined)}
              />
              {part.color !== undefined ? (
                <PropertyField
                  kind="color"
                  label="Color"
                  value={part.color}
                  onChange={(next) => setColor(index, next)}
                />
              ) : null}
              <FontField label="Face" value={part.font} onChange={(next) => setFont(index, next)} />
              <PropertyField
                kind="enum"
                label="Drawn as"
                value={part.shape ?? 'glyphs'}
                options={SHAPES}
                onChange={(next) => edit(index, { shape: next as SlicePart['shape'] })}
              />
            </>
          ) : null}
        </PropertyGroup>
      ))}
    </>
  )
}
