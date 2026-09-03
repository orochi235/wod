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

  // Two panels, split by what a field decides: how the wedge is laid out, or
  // what is set on it. A layout's own knobs are the first kind; a list of parts
  // is the second, and it is long enough to bury the first if they share a box.
  const shape = layout?.fields.filter((field) => field.kind !== 'parts') ?? []
  const contents = layout?.fields.filter((field) => field.kind === 'parts') ?? []

  return (
    <>
      <PropertyPanel title="Slice layout" className="editor__center-panel">
        <SelectRow
          label="Layout"
          value={layout?.id ?? NONE}
          options={[
            { value: NONE, label: 'Name plate (default)' },
            ...SLICE_LIST.map((item) => ({ value: item.id, label: item.name })),
          ]}
          onChange={choose}
        />
        {slice && shape.length > 0 ? (
          <RecipeForm fields={shape} params={slice.params} segments={[]} onChange={edit} />
        ) : null}
      </PropertyPanel>
      {slice && contents.length > 0 ? (
        <PropertyPanel title="On the slice" className="editor__center-panel">
          <RecipeForm fields={contents} params={slice.params} segments={[]} onChange={edit} />
        </PropertyPanel>
      ) : null}
    </>
  )
}
