import { useId } from 'react'
import type { Measure, SliceInstance } from '../slice/types'
import { SliceElements } from '../wheel/SliceElements'
import { arcPath } from '../wheel/geometry'
import type { Theme } from '../wheel/theme'
import { styleOfTheme } from '../wheel/themeStyle'
import type { Segment } from '../wheel/types'
import { PREVIEW_RADIUS, drawWedge, previewArc, previewBox } from './wedge'

export type WedgePreviewProps = {
  instance: SliceInstance
  segment: Segment
  degrees: number
  theme: Theme
  measure: Measure
  /** What the wedge is painted. The segment's own color is only the default. */
  fill: string
  /**
   * Size the box to hold this many degrees instead of sharing the standard one.
   * For a wedge too wide to fit it, which would otherwise be clipped.
   */
  fitDegrees?: number
  /** The cap to mask out, in preview units. Zero draws the tip in full. */
  hub: number
}

const SHARED_BOX = previewBox()
const viewBoxOf = (box: { x: number; y: number; width: number; height: number }) =>
  `${box.x} ${box.y} ${box.width} ${box.height}`

export function WedgePreview({
  instance,
  segment,
  degrees,
  theme,
  measure,
  fill,
  fitDegrees,
  hub,
}: WedgePreviewProps) {
  const box = fitDegrees === undefined ? SHARED_BOX : previewBox(fitDegrees)
  const arc = previewArc(degrees)
  const elements = drawWedge({ instance, segment, degrees, measure, font: theme.font })
  const maskId = `${useId()}-hub`

  return (
    <svg
      className="studio__preview"
      viewBox={viewBoxOf(box)}
      role="img"
      aria-label={`wedge at ${Math.round(degrees)} degrees`}
      style={styleOfTheme(theme)}
    >
      {hub > 0 && (
        // The cap covers the tip on the real wheel, so a preview that drew it
        // would show room the type can never actually have.
        <mask id={maskId}>
          <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="white" />
          <circle r={hub} fill="black" />
        </mask>
      )}
      <g mask={hub > 0 ? `url(#${maskId})` : undefined}>
        <path
          className="wheel__segment"
          d={arcPath(arc.start, arc.end, PREVIEW_RADIUS)}
          fill={fill}
        />
        <SliceElements
          elements={elements}
          arc={arc}
          radius={PREVIEW_RADIUS}
          id={`studio-${degrees}`}
        />
      </g>
    </svg>
  )
}
