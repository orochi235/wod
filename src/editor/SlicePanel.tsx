import { PropertyPanel, SelectRow } from '@weasel-js/labkit'
import { SLICE_LIST, getSlice } from '../slice/registry'
import type { SliceInstance, SliceParams } from '../slice/types'
import { RecipeForm } from './RecipeForm'

export type SlicePanelProps = {
  slice: SliceInstance | undefined
  onChange: (slice: SliceInstance | undefined) => void
}

const NONE = ''

export function SlicePanel({ slice, onChange }: SlicePanelProps) {
  const layout = slice ? getSlice(slice.id) : null

  const choose = (value: string) => {
    if (value === NONE) {
      onChange(undefined)
      return
    }
    const chosen = getSlice(value)
    if (!chosen) return
    onChange({ id: chosen.id, params: { ...chosen.defaults } })
  }

  const edit = (params: SliceParams) => {
    if (!slice) return
    onChange({ ...slice, params })
  }

  return (
    <PropertyPanel title="Slice layout">
      <SelectRow
        label="Layout"
        value={layout?.id ?? NONE}
        options={[
          { value: NONE, label: 'Auto (default)' },
          ...SLICE_LIST.map((item) => ({ value: item.id, label: item.name })),
        ]}
        onChange={choose}
      />
      {layout && slice ? (
        <RecipeForm fields={layout.fields} params={slice.params} segments={[]} onChange={edit} />
      ) : null}
    </PropertyPanel>
  )
}
