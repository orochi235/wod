import { CheckboxRow, PropertyPanel, SelectRow, TextRow } from '@weasel-js/labkit'
import type { Hub } from '../preset/types'
import type { Media } from '../wheel/types'

export type HubPanelProps = {
  hub: Hub | undefined
  onChange: (hub: Hub | undefined) => void
}

const NONE = ''

const KINDS: { value: Media['kind']; label: string }[] = [
  { value: 'emoji', label: 'An emoji' },
  { value: 'image', label: 'A picture' },
  { value: 'gif', label: 'An animation' },
]

/** Absent rather than empty, matching what storage keeps: the two mean one thing. */
const settle = (hub: Hub): Hub | undefined =>
  hub.emblem === undefined && hub.spins === undefined ? undefined : hub

export function HubPanel({ hub, onChange }: HubPanelProps) {
  const emblem = hub?.emblem

  const setKind = (value: string) => {
    if (value === NONE) {
      onChange(settle({ ...hub, emblem: undefined }))
      return
    }
    const kind = KINDS.find((entry) => entry.value === value)
    if (!kind) return
    onChange({ ...hub, emblem: { kind: kind.value, value: emblem?.value ?? '' } })
  }

  return (
    <PropertyPanel title="Hub" className="editor__center-panel">
      <SelectRow
        label="Emblem"
        value={emblem?.kind ?? NONE}
        options={[{ value: NONE, label: 'None' }, ...KINDS]}
        onChange={setKind}
      />
      {emblem ? (
        <TextRow
          label={emblem.kind === 'emoji' ? 'Character' : 'Address'}
          value={emblem.value}
          onChange={(value) => onChange({ ...hub, emblem: { ...emblem, value } })}
        />
      ) : null}
      <CheckboxRow
        label="Turns with the wheel"
        value={hub?.spins ?? false}
        onChange={(spins) => onChange(settle({ ...hub, spins: spins || undefined }))}
      />
    </PropertyPanel>
  )
}
