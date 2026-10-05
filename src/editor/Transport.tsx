import { FRAME_MS } from './recordShow'

export type TransportProps = {
  /** The whole show, outage prologue included; 0 when there is nothing to spin. */
  durationMs: number
  /** Where the scrubber sits, ms into the show. */
  valueMs: number
  isSpinning: boolean
  /** Scrubbing plays the rigged show on demand, so a locked editor withholds it. */
  showScrub: boolean
  onSpin: () => void
  onScrub: (ms: number) => void
}

export function Transport({
  durationMs,
  valueMs,
  isSpinning,
  showScrub,
  onSpin,
  onScrub,
}: TransportProps) {
  return (
    <div className="transport">
      {showScrub && durationMs > 0 ? (
        <label className="transport__scrub">
          <span>Scrub</span>
          <input
            type="range"
            min={0}
            max={durationMs}
            step={FRAME_MS}
            value={Math.min(valueMs, durationMs)}
            disabled={isSpinning}
            onChange={(event) => onScrub(Number.parseFloat(event.target.value))}
          />
          <output>{(valueMs / 1000).toFixed(2)} s</output>
        </label>
      ) : null}
      <button type="button" onClick={onSpin} disabled={isSpinning}>
        Spin
      </button>
    </div>
  )
}
