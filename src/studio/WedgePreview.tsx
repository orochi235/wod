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
}

const BOX = previewBox()
const VIEW_BOX = `${BOX.x} ${BOX.y} ${BOX.width} ${BOX.height}`

export function WedgePreview({ instance, segment, degrees, theme, measure }: WedgePreviewProps) {
  const arc = previewArc(degrees)
  const elements = drawWedge({ instance, segment, degrees, measure, font: theme.font })

  return (
    <svg
      className="studio__preview"
      viewBox={VIEW_BOX}
      role="img"
      aria-label={`wedge at ${Math.round(degrees)} degrees`}
      style={styleOfTheme(theme)}
    >
      <path
        className="wheel__segment"
        d={arcPath(arc.start, arc.end, PREVIEW_RADIUS)}
        fill={segment.color}
      />
      <SliceElements
        elements={elements}
        arc={arc}
        radius={PREVIEW_RADIUS}
        id={`studio-${degrees}`}
      />
    </svg>
  )
}
