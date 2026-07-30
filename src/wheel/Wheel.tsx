import type { Ref } from 'react'
import { arcPath, arcs } from './geometry'
import { fitLabel } from './label'
import { paletteColor } from './palette'
import type { Segment } from './types'
import './Wheel.css'

export type WheelProps = {
  segments: Segment[]
  radius?: number
  rotationDeg?: number
  rotorRef?: Ref<SVGGElement>
}

export function Wheel({ segments, radius = 200, rotationDeg = 0, rotorRef }: WheelProps) {
  const layout = arcs(segments)
  const viewBox = `${-radius - 4} ${-radius - 4} ${(radius + 4) * 2} ${(radius + 4) * 2}`

  return (
    <svg className="wheel" viewBox={viewBox} role="img" aria-label="wheel">
      <g className="wheel__rotor" transform={`rotate(${rotationDeg})`} ref={rotorRef}>
        {layout.map((arc, index) => {
          const width = arc.end - arc.start
          if (!(width > 0)) return null

          const segment = segments[index]
          const d = arcPath(arc.start, arc.end, radius)
          if (d === '') return null

          const color = segment.color ?? paletteColor(index)
          const fitted = fitLabel(segment.label, width, radius)
          const midDeg = (arc.start + width / 2) * 360
          // Radial text reads upside down when its baseline points leftward on
          // screen. Flip those segments so every label reads left-to-right.
          const flipped = Math.cos(((midDeg + 90) * Math.PI) / 180) < 0

          return (
            <g key={segment.id}>
              <path className="wheel__segment" d={d} fill={color} />
              {fitted && (
                <text
                  className="wheel__label"
                  fontSize={fitted.fontSize}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${midDeg}) translate(0 ${-radius * 0.62}) rotate(90)${flipped ? ' rotate(180)' : ''}`}
                >
                  {fitted.text}
                </text>
              )}
            </g>
          )
        })}
      </g>
      {/* Apex inward: the tip is the thing that names a winner, so it sits on
          the wheel rather than above it. The base stays just past the rim. */}
      <polygon
        className="wheel__pointer"
        points={`0,${-radius + 18} -12,${-radius - 4} 12,${-radius - 4}`}
      />
    </svg>
  )
}
