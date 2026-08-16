import type { Media } from './types'

export type HubEmblemProps = {
  emblem: Media
  /** The cap's radius. The emblem is inscribed in it, never drawn past it. */
  radius: number
  /** Clip ids share a document with every other wheel on the page. */
  id: string
}

/**
 * An emoji is type and an image is a picture, so they take the cap differently:
 * the glyph is set to the cap's height, while the picture fills the square the
 * cap is inscribed in and is clipped back to the circle. Filling the square is
 * what keeps a logo from sitting in a moat of hub.
 */
export function HubEmblem({ emblem, radius, id }: HubEmblemProps) {
  if (radius <= 0) return null

  if (emblem.kind === 'emoji') {
    return (
      <text
        className="wheel__emblem"
        fontSize={radius * 1.1}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {emblem.value}
      </text>
    )
  }

  const clipId = `hub-emblem-${id}`
  return (
    <>
      <clipPath id={clipId}>
        <circle r={radius} />
      </clipPath>
      <image
        className="wheel__emblem"
        href={emblem.value}
        x={-radius}
        y={-radius}
        width={radius * 2}
        height={radius * 2}
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#${clipId})`}
      />
    </>
  )
}
