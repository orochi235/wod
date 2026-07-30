import { useEffect, useState } from 'react'
import { applyMorphs } from '../wheel/morph'
import type { Morph, Segment } from '../wheel/types'

export type TransportProps = {
  segments: Segment[]
  morphs: Morph[]
  durationMs: number
  isSpinning: boolean
  onSpin: () => void
  /** Receives the geometry at the scrubbed instant. */
  onScrub?: (segments: Segment[]) => void
}

export function Transport({
  segments,
  morphs,
  durationMs,
  isSpinning,
  onSpin,
  onScrub,
}: TransportProps) {
  const [t, setT] = useState(0)

  // `applyMorphs` is already pure, so scrubbing needs no animation machinery —
  // it samples exactly the function a real spin runs, at a fixed instant.
  useEffect(() => {
    onScrub?.(applyMorphs(segments, morphs, t * durationMs))
  }, [t, segments, morphs, durationMs, onScrub])

  return (
    <div className="transport">
      <label className="transport__scrub">
        <span>Scrub</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={t}
          disabled={isSpinning}
          onChange={(event) => setT(Number.parseFloat(event.target.value))}
        />
        <output>{t.toFixed(2)}</output>
      </label>
      <button type="button" onClick={onSpin} disabled={isSpinning}>
        Spin with these tricks
      </button>
    </div>
  )
}
