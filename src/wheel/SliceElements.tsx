import { familyStack } from '../slice/measure'
import type { SliceElement } from '../slice/types'
import { concentricPath } from './geometry'

export type SliceElementsProps = {
  elements: SliceElement[]
  arc: { start: number; end: number }
  radius: number
  /** Segment id, used to make emitted path ids unique. */
  id: string
  /** Registers a level group so a spin can counter-rotate it. */
  levelRef?: (element: SVGGElement | null) => void
}

const round = (n: number): number => Number(n.toFixed(2))

export function SliceElements({ elements, arc, radius, id, levelRef }: SliceElementsProps) {
  const width = arc.end - arc.start
  const midDeg = round((arc.start + width / 2) * 360)

  return (
    <>
      {elements.map((element, index) => {
        const key = `${id}-${index}`
        // Every size on this element was measured in this face. Painting it in
        // the class's family instead would be a silently wrong size.
        const fontFamily = element.family ? familyStack(element.family) : undefined

        if (element.kind === 'raw') return <g key={key}>{element.node}</g>

        // A part's own color, or nothing — the class keeps the wedge's ink.
        const fill = element.ink

        if (element.kind === 'path') {
          // A path with no fill of its own is a label — outline mode's warped
          // run — and takes the label's color rather than disappearing.
          return (
            <path
              key={key}
              className={element.fill ? undefined : 'wheel__label'}
              d={element.d}
              fill={element.fill ?? fill}
              opacity={element.opacity}
            />
          )
        }

        if (element.kind === 'curvedText') {
          const pathId = `slice-${key}`
          return (
            <g key={key}>
              <path
                id={pathId}
                d={concentricPath(arc.start, arc.end, radius * element.anchor)}
                fill="none"
              />
              <text
                className="wheel__label"
                fontFamily={fontFamily}
                fontSize={element.size}
                letterSpacing={element.letterSpacing}
                fill={fill}
                textAnchor="middle"
              >
                <textPath href={`#${pathId}`} startOffset="50%">
                  {element.text}
                </textPath>
              </text>
            </g>
          )
        }

        if (element.kind === 'glyphRun') {
          return (
            <g key={key}>
              {element.glyphs.map((glyph, glyphIndex) => (
                <text
                  // Glyphs are positions in a solved run, not a keyed list.
                  // biome-ignore lint/suspicious/noArrayIndexKey: a glyph is its position.
                  key={`${key}-${glyphIndex}`}
                  className="wheel__label"
                  fontFamily={fontFamily}
                  fontSize={glyph.size}
                  fill={fill}
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`translate(${glyph.x} ${glyph.y}) rotate(${glyph.rotate}) scale(${glyph.scale[0]} ${glyph.scale[1]})`}
                >
                  {glyph.char}
                </text>
              ))}
            </g>
          )
        }

        const anchorRadius = round(radius * element.anchor)

        if (element.frame === 'level') {
          return (
            <g key={key} transform={`rotate(${midDeg}) translate(0 ${-anchorRadius})`}>
              {/* The animation replaces this transform; it is the resting value.
                  Level content must be centered on this group's own origin. */}
              <g className="wheel__level" transform={`rotate(${-midDeg})`} ref={levelRef}>
                {element.kind === 'image' ? (
                  <image
                    href={element.href}
                    x={-element.size / 2}
                    y={-element.size / 2}
                    width={element.size}
                    height={element.size}
                  />
                ) : (
                  <text
                    className="wheel__label"
                    fontFamily={fontFamily}
                    fontSize={element.size}
                    letterSpacing={element.letterSpacing}
                    fill={fill}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {element.text}
                  </text>
                )}
              </g>
            </g>
          )
        }

        if (element.kind === 'image') {
          return (
            <image
              key={key}
              href={element.href}
              x={-element.size / 2}
              y={-element.size / 2}
              width={element.size}
              height={element.size}
              transform={`rotate(${midDeg}) translate(0 ${-anchorRadius})`}
            />
          )
        }

        // Single handedness: radial text always runs outward, never flipped by
        // which half of the wheel the wedge happens to sit on.
        const along = element.along === 'radial' ? ' rotate(-90)' : ''
        return (
          <text
            key={key}
            className="wheel__label"
            fontFamily={fontFamily}
            fontSize={element.size}
            letterSpacing={element.letterSpacing}
            fill={fill}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${midDeg}) translate(0 ${-anchorRadius})${along}`}
          >
            {element.text}
          </text>
        )
      })}
    </>
  )
}
