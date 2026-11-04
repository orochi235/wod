import { SONGS } from '../wheel/songs'

type FlapperControlsProps = {
  songId: string
  onSong: (id: string) => void
  fit: boolean
  onFit: (fit: boolean) => void
}

export function FlapperControls({ songId, onSong, fit, onFit }: FlapperControlsProps) {
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
      {songId !== '' && (
        <label className="app__button app__toggle">
          <input type="checkbox" checked={fit} onChange={(event) => onFit(event.target.checked)} />
          Fit spin to song
        </label>
      )}
    </>
  )
}
