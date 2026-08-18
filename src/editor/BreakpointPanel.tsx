import { PropertyPanel, SelectRow, Subpanel } from '@weasel-js/labkit'
import { useState } from 'react'
import type { Breakpoint } from '../slice/breakpoints'
import { DEFAULT_SLICE, SLICE_LIST, getSlice } from '../slice/registry'
import { turnFraction } from '../slice/turns'
import type { SliceInstance, SliceParams } from '../slice/types'
import { BandTrack } from './BandTrack'
import { RecipeForm } from './RecipeForm'
import { AXIS_MAX_DEG, type Band, bandsOf, removeBand, splitBand } from './bands'

export type BreakpointPanelProps = {
  breakpoints: Breakpoint[] | undefined
  /** The wheel's own layout, which is what the widths no breakpoint claims get. */
  wheelSlice?: SliceInstance
  onChange: (breakpoints: Breakpoint[] | undefined) => void
}

const widestFirst = (list: Breakpoint[]): Breakpoint[] => [...list].sort((a, b) => b.from - a.from)

const nameOf = (slice: SliceInstance): string => getSlice(slice.id)?.name ?? slice.id

const titleOf = (band: Band): string => {
  if (band.source !== null) return `From ${turnFraction(band.from)}`
  return band.to >= AXIS_MAX_DEG ? 'Every width' : `Below ${turnFraction(band.to)}`
}

export function BreakpointPanel({ breakpoints, wheelSlice, onChange }: BreakpointPanelProps) {
  // Null is the band below the lowest floor — the one no breakpoint claims, and
  // the only band there is before anyone has authored one.
  const [selected, setSelected] = useState<number | null>(null)

  // The same fallback the resolver uses, so the band below every floor is named
  // for what a wedge there is actually set as.
  const wheel = wheelSlice ?? DEFAULT_SLICE
  const list = widestFirst(breakpoints ?? [])
  const bands = bandsOf(list)
  const band = bands.find((entry) => entry.source === selected) ?? bands[0]

  const write = (next: Breakpoint[]) => onChange(next.length > 0 ? widestFirst(next) : undefined)

  const replace = (source: number, point: Breakpoint) =>
    write(list.map((entry, at) => (at === source ? point : entry)))

  // Sorting for storage renumbers the list, so the new band is found by the
  // width it was cut at rather than by where `splitBand` appended it.
  const split = () => {
    const result = splitBand(list, band, wheel)
    if (!result) return
    const sorted = widestFirst(result.next)
    onChange(sorted)
    setSelected(sorted.findIndex((point) => point.from === result.from / 360))
  }

  const remove = () => {
    if (band.source === null) return
    write(removeBand(list, band.source))
    setSelected(null)
  }

  const source = band.source
  const point = source === null ? null : list[source]
  const layout = point ? getSlice(point.slice.id) : null

  return (
    <PropertyPanel title="Widths">
      <BandTrack
        breakpoints={list}
        fallbackName={nameOf(wheel)}
        nameOf={nameOf}
        selected={band.source}
        onSelect={setSelected}
        onChange={write}
      />
      <Subpanel title={titleOf(band)}>
        {/* labkit packs a subpanel two columns wide; this is its own hook for a
            child that wants the whole width. */}
        <div className="lk-property-list__span bands__form">
          {point && source !== null ? (
            <>
              <SelectRow
                label="Layout"
                value={point.slice.id}
                options={SLICE_LIST.map((item) => ({ value: item.id, label: item.name }))}
                onChange={(value) => {
                  const chosen = getSlice(value)
                  if (!chosen) return
                  replace(source, {
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
                    replace(source, { ...point, slice: { ...point.slice, params } })
                  }
                />
              ) : null}
            </>
          ) : (
            <p className="bands__note">
              {band.to >= AXIS_MAX_DEG
                ? 'Every wedge is set as the wheel is.'
                : `Wedges narrower than ${turnFraction(band.to)} are set as the wheel is.`}
            </p>
          )}
          <div className="bands__actions">
            <button type="button" onClick={split}>
              Split band
            </button>
            {point && source !== null ? (
              <button type="button" onClick={remove}>
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </Subpanel>
    </PropertyPanel>
  )
}
