import type { Media } from '../wheel/types'
import { applyTransform } from './ladder'
import { MIN_SIZE } from './layouts/shared'
import type { PartContent, SliceContext, SliceElement, SlicePart } from './types'

/** What a part with no `maxSize` of its own may reach. */
export const DEFAULT_MAX_SIZE = 40

type Resolved = { kind: 'text'; text: string } | { kind: 'image'; href: string }

const round = (n: number): number => Math.round(n * 100) / 100

function resolveContent(content: PartContent, ctx: SliceContext): Resolved | null {
  switch (content.from) {
    case 'label':
      return { kind: 'text', text: applyTransform(content.transform ?? 'full', ctx.segment.label) }
    case 'text':
      return { kind: 'text', text: content.value }
    case 'media': {
      const media: Media | undefined = ctx.segment.media
      if (!media) return null
      return media.kind === 'emoji'
        ? { kind: 'text', text: media.value }
        : { kind: 'image', href: media.value }
    }
    case 'derived': {
      if (content.value === 'weight') return { kind: 'text', text: String(ctx.segment.weight) }
      if (content.value === 'index') return { kind: 'text', text: String(ctx.index + 1) }
      return { kind: 'text', text: `${ctx.index + 1}/${ctx.count}` }
    }
  }
}

type FittedOrientation = 'radial' | 'tangential' | 'curved'
type FittedPart = SlicePart & { orientation: FittedOrientation }

const isFitted = (part: SlicePart): part is FittedPart =>
  part.orientation === 'radial' ||
  part.orientation === 'tangential' ||
  part.orientation === 'curved'

/** The three orientations that predate parts, drawn exactly as they were. */
function fitted(part: FittedPart, ctx: SliceContext, text: string): SliceElement[] {
  const frame = part.frame ?? 'wheel'
  const [inner, outer] = part.band
  const placed = ctx.fit({
    text,
    orientation: part.orientation,
    frame,
    width: ctx.arc.end - ctx.arc.start,
    radius: ctx.radius,
    anchor: (inner + outer) / 2,
    maxSize: part.maxSize ?? DEFAULT_MAX_SIZE,
    minSize: MIN_SIZE,
  })
  if (!placed) return []

  // A level run is horizontal by construction, so it has no orientation left to
  // honor and always lays out as a straight line.
  if (frame === 'wheel' && part.orientation === 'curved') {
    return [
      { kind: 'curvedText', text: placed.text, anchor: placed.anchor, size: placed.size, frame },
    ]
  }
  return [
    {
      kind: 'text',
      text: placed.text,
      along: frame === 'level' || part.orientation === 'tangential' ? 'tangential' : 'radial',
      anchor: placed.anchor,
      size: placed.size,
      frame,
    },
  ]
}

export function typeset(part: SlicePart, ctx: SliceContext): SliceElement[] {
  const resolved = resolveContent(part.content, ctx)
  if (resolved === null) return []

  const [inner, outer] = part.band
  if (resolved.kind === 'image') {
    return [
      {
        kind: 'image',
        href: resolved.href,
        anchor: (inner + outer) / 2,
        size: round((outer - inner) * ctx.radius),
        frame: part.frame,
      },
    ]
  }

  if (resolved.text.length === 0) return []
  if (isFitted(part)) return fitted(part, ctx, resolved.text)
  return []
}
