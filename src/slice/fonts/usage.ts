import { readPartList } from '../parts'
import type { FontId, SliceInstance } from '../types'
import { resolveFont } from './registry'

export type FaceUse = {
  id: FontId
  family: string
  /** Whether anything asks for this face's outlines, which is what costs a parse. */
  outline: boolean
}

/**
 * Which faces a wheel has to load, and which of them anything wants warped. The
 * measurer needs every face a wedge paints in; only outline mode needs a parse.
 */
export function facesUsed(instances: SliceInstance[], theme: FontId | undefined): FaceUse[] {
  const used = new Map<FontId, FaceUse>()

  const add = (id: FontId | undefined, outline: boolean) => {
    const font = resolveFont(id, theme)
    const already = used.get(font.id)
    if (already) already.outline ||= outline
    else used.set(font.id, { id: font.id, family: font.family, outline })
  }

  for (const instance of instances) {
    const parts = instance.id === 'composed' ? readPartList(instance.params.parts) : []
    if (parts.length === 0) add(undefined, false)
    for (const part of parts) add(part.font, part.shape === 'outline')
  }

  return [...used.values()]
}
