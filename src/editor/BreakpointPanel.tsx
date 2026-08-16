import { NumberRow, PropertyPanel, SelectRow, Subpanel } from '@weasel-js/labkit'
import type { Breakpoint } from '../slice/breakpoints'
import { DEFAULT_SLICE, SLICE_LIST, getSlice } from '../slice/registry'
import type { SliceParams } from '../slice/types'
import { RecipeForm } from './RecipeForm'

export type BreakpointPanelProps = {
  breakpoints: Breakpoint[] | undefined
  onChange: (breakpoints: Breakpoint[] | undefined) => void
}

/** A twelfth of a turn — the width the name plate stops reading below. */
const NEW_BREAKPOINT_FROM = 1 / 12

const degreesOf = (turns: number): number => Math.round(turns * 360 * 10) / 10

export function BreakpointPanel({ breakpoints, onChange }: BreakpointPanelProps) {
  const list = breakpoints ?? []

  // Widest first on every write, so the list a preset stores and the list this
  // panel shows are in the one order the resolver documents.
  const write = (next: Breakpoint[]) =>
    onChange(next.length > 0 ? [...next].sort((a, b) => b.from - a.from) : undefined)

  const replace = (index: number, point: Breakpoint) =>
    write(list.map((entry, at) => (at === index ? point : entry)))

  return (
    <PropertyPanel title="Widths">
      {list.map((point, index) => {
        const layout = getSlice(point.slice.id)
        return (
          <Subpanel key={`${point.from}-${index}`} title={`From ${degreesOf(point.from)}°`}>
            <NumberRow
              label="From (degrees)"
              value={degreesOf(point.from)}
              min={0}
              max={360}
              step={1}
              onChange={(degrees) =>
                replace(index, {
                  ...point,
                  from: Number.isFinite(degrees) ? degrees / 360 : point.from,
                })
              }
            />
            <SelectRow
              label="Layout"
              value={point.slice.id}
              options={SLICE_LIST.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => {
                const chosen = getSlice(value)
                if (!chosen) return
                replace(index, {
                  ...point,
                  slice: { id: chosen.id, params: { ...chosen.defaults } },
                })
              }}
            />
            {layout && layout.fields.length > 0 ? (
              <RecipeForm
                fields={layout.fields}
                params={point.slice.params}
                segments={[]}
                onChange={(params: SliceParams) =>
                  replace(index, { ...point, slice: { ...point.slice, params } })
                }
              />
            ) : null}
            <button
              type="button"
              className="breakpoint__remove"
              onClick={() => write(list.filter((_, at) => at !== index))}
            >
              Remove
            </button>
          </Subpanel>
        )
      })}
      <button
        type="button"
        className="breakpoint__add"
        onClick={() => write([...list, { from: NEW_BREAKPOINT_FROM, slice: DEFAULT_SLICE }])}
      >
        Add breakpoint
      </button>
    </PropertyPanel>
  )
}
