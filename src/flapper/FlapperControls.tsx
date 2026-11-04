import { SONGS } from '../wheel/songs'

type Bars = { from: number; to: number }

type FlapperControlsProps = {
  songId: string
  onSong: (id: string) => void
  fit: boolean
  onFit: (fit: boolean) => void
  /** The bars played; null for a tune that has none. */
  bars: Bars | null
  barCount: number
  onBars: (bars: Bars) => void
}

export function FlapperControls({
  songId,
  onSong,
  fit,
  onFit,
  bars,
  barCount,
  onBars,
}: FlapperControlsProps) {
  const bar = (value: string, fallback: number) => {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), barCount) : fallback
  }
  return (
    <>
      <select
        className="app__button"
        aria-label="Flapper sound"
        value={songId}
        onChange={(event) => onSong(event.target.value)}
      >
        <option value="">Tick</option>
        {SONGS.map((song) => (
          <option key={song.id} value={song.id}>
            {song.name}
          </option>
        ))}
      </select>
      {bars && (
        <span className="app__button app__toggle">
          Bars
          <input
            className="app__bar"
            type="number"
            aria-label="First bar"
            min={1}
            max={barCount}
            value={bars.from}
            onChange={(event) => {
              const from = bar(event.target.value, bars.from)
              onBars({ from, to: Math.max(from, bars.to) })
            }}
          />
          –
          <input
            className="app__bar"
            type="number"
            aria-label="Last bar"
            min={1}
            max={barCount}
            value={bars.to}
            onChange={(event) => {
              const to = bar(event.target.value, bars.to)
              onBars({ from: Math.min(bars.from, to), to })
            }}
          />
        </span>
      )}
      {songId !== '' && (
        <label className="app__button app__toggle">
          <input type="checkbox" checked={fit} onChange={(event) => onFit(event.target.checked)} />
          Fit spin to song
        </label>
      )}
    </>
  )
}
