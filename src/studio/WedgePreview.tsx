import { useId } from 'react'
import type { Measure, SliceInstance } from '../slice/types'
import { SliceElements } from '../wheel/SliceElements'
import { arcPath } from '../wheel/geometry'
import { partOn } from '../wheel/theme'
import type { Theme } from '../wheel/theme'
import { styleOfTheme } from '../wheel/themeStyle'
import type { Segment } from '../wheel/types'
import { PREVIEW_RADIUS, drawWedge, previewArc, previewBox, previewHubRadius } from './wedge'

export type WedgePreviewProps = {
  instance: SliceInstance
  segment: Segment
  degrees: number
  theme: Theme
  measure: Measure
  /** What the wedge is painted. The segment's own color is only the default. */
  fill: string
  /** Takes the doubled box, for a wedge the standard one cannot hold. */
  wide?: boolean
}

const BOXES = { narrow: previewBox(), wide: previewBox(2) }
const viewBoxOf = (box: { x: number; y: number; width: number; height: number }) =>
  `${box.x} ${box.y} ${box.width} ${box.height}`

export function WedgePreview({
  instance,
  segment,
  degrees,
  theme,
  measure,
  fill,
  wide = false,
}: WedgePreviewProps) {
  const box = wide ? BOXES.wide : BOXES.narrow
  const arc = previewArc(degrees)
  const elements = drawWedge({ instance, segment, degrees, measure, font: theme.font })
  const hub = partOn(theme, 'hub') ? previewHubRadius(theme.metrics.hubRadius) : 0
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
