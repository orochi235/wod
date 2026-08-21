import { Slider, type Thumb } from '@weasel-js/labkit/weasel-ui'
import type { CSSProperties } from 'react'
import type { Breakpoint } from '../slice/breakpoints'
import { turnFraction } from '../slice/turns'
import type { SliceInstance } from '../slice/types'
import './BandTrack.css'
import {
  AXIS_MAX,
  AXIS_MAX_DEG,
  AXIS_MIN,
  AXIS_MIN_DEG,
  type Band,
  bandsOf,
  floorsOf,
  fromAxis,
  snapDegrees,
  stopAbove,
  stopBelow,
  toAxis,
} from './bands'

export type BandTrackProps = {
  breakpoints: Breakpoint[]
  /** What a width no breakpoint claims resolves to. */
  fallbackName: string
  nameOf: (slice: SliceInstance) => string
  /** The band's `source`. Null is the span below the lowest floor. */
  selected: number | null
  onSelect: (source: number | null) => void
  onChange: (next: Breakpoint[]) => void
}

/** Carries its floor's stored width, which is what an untouched stop writes back. */
type Stop = Thumb & { source: number; degrees: number }

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n))

/** Geometry, not styling: the band's own share of the track. */
const span = (from: number, to: number): CSSProperties =>
  ({ '--band-from': `${from * 100}%`, '--band-span': `${(to - from) * 100}%` }) as CSSProperties

export function BandTrack({
  breakpoints,
  fallbackName,
  nameOf,
  selected,
  onSelect,
  onChange,
}: BandTrackProps) {
  const bands = bandsOf(breakpoints)
  const stops: Stop[] = floorsOf(breakpoints).map((floor) => {
    const degrees = clamp(floor.degrees, AXIS_MIN_DEG, AXIS_MAX_DEG)
    return {
      source: floor.source,
      degrees,
      value: toAxis(degrees),
      bounds: ({ thumbs, index }) => [
        index > 0 ? toAxis(stopAbove(fromAxis(thumbs[index - 1].value))) : AXIS_MIN,
        index < thumbs.length - 1 ? toAxis(stopBelow(fromAxis(thumbs[index + 1].value))) : AXIS_MAX,
      ],
    }
  })

  /**
   * A stop that moved lands on a stop, and on the next one along when snapping
   * would have left it where it was: the arrow key steps the axis by a hundredth
   * of its length, far less than the gap between stops.
   */
  const settle = (stop: Stop, before: Stop, lower: number, upper: number): number => {
    const snapped = snapDegrees(stop.value)
    const stepped =
      snapped === before.degrees
        ? stop.value > before.value
          ? stopAbove(before.degrees)
          : stopBelow(before.degrees)
        : snapped
    return clamp(stepped, lower, upper)
  }

  const write = (next: Stop[]) => {
    const kept = new Map<number, number>()
    for (let index = 0; index < next.length; index++) {
      const stop = next[index]
      const before = stops.find((entry) => entry.source === stop.source)
      if (!before) continue
      if (stop.value === before.value) {
        kept.set(stop.source, before.degrees)
        continue
      }
      const lower = index > 0 ? stopAbove(next[index - 1].degrees) : AXIS_MIN_DEG
      const upper = index < next.length - 1 ? stopBelow(next[index + 1].degrees) : AXIS_MAX_DEG
      kept.set(stop.source, settle(stop, before, lower, upper))
    }

    const written = breakpoints
      .map((point, source) => {
        const degrees = kept.get(source)
        if (degrees === undefined) return null
        return degrees === point.from * 360 ? point : { ...point, from: degrees / 360 }
      })
      .filter((point): point is Breakpoint => point !== null)

    const same =
      written.length === breakpoints.length &&
      written.every((point, at) => point === breakpoints[at])
    if (!same) onChange(written)
  }

  const label = (band: Band): string => (band.slice ? nameOf(band.slice) : fallbackName)

  return (
    <div className="bands">
      <Slider<Stop>
        thumbs={stops}
        onChange={write}
        min={AXIS_MIN}
        max={AXIS_MAX}
        constraint="ordered"
        trackHeight={34}
        className="bands__slider"
        ariaLabel="Width boundary at"
        onRemoveThumb={() => true}
        readoutPlacement="below-thumb"
        renderReadout={(stop) => turnFraction(stop.degrees)}
        renderTrack={({ valueToFraction }) => (
          <div className="bands__track">
            {bands.map((band) => {
              return (
                <button
                  key={band.source ?? 'fall-through'}
                  type="button"
                  className={band.slice ? 'bands__band' : 'bands__band bands__band--fallback'}
                  aria-pressed={band.source === selected}
                  style={span(valueToFraction(toAxis(band.from)), valueToFraction(toAxis(band.to)))}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onSelect(band.source)}
                >
                  {label(band)}
                </button>
              )
            })}
          </div>
        )}
      />
    </div>
  )
}
