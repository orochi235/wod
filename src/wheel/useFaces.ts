import { useEffect, useState } from 'react'
import { requestFace } from '../slice/fonts/load'
import type { FaceUse } from '../slice/fonts/usage'
import { FONT_WEIGHT, familyStack } from '../slice/measure'

/**
 * Asks for the faces a wheel needs and reports when one lands.
 *
 * Two arrivals, and both have to retire the measurer: the webfont the label is
 * painted in, which decides every fitted size, and the parsed outlines a part in
 * outline mode is warped from. Nothing recomputes on its own — sizes are decided
 * during render and the measurer caches per string — so the token this returns
 * is what makes the wheel redraw against what finally arrived.
 */
export function useFaces(faces: FaceUse[]): number {
  const [landed, setLanded] = useState(0)
  const key = faces.map((face) => `${face.id}${face.outline ? '!' : ''}`).join(' ')

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the face list, flattened so a re-render with the same faces asks nothing again.
  useEffect(() => {
    let live = true
    const arrived = () => {
      if (live) setLanded((count) => count + 1)
    }

    for (const face of faces) {
      // Loading a face the stylesheet has not been asked to paint yet: the
      // measurer would otherwise size a wedge against the fallback and cache it.
      document.fonts
        ?.load?.(`${FONT_WEIGHT} 100px ${familyStack(face.family)}`)
        ?.then(arrived, () => {})
      if (face.outline) requestFace(face.id).then(arrived, () => {})
    }

    return () => {
      live = false
    }
  }, [key])

  return landed
}
