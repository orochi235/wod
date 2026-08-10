import type { Media, Reveal } from '../wheel/types'

export type RevealEditorProps = {
  /** Names the controls for screen readers, since the row has no heading. */
  name: string
  reveal: Reveal | undefined
  onChange: (reveal: Reveal | undefined) => void
}

const KINDS: Media['kind'][] = ['emoji', 'image', 'gif']

export function RevealEditor({ name, reveal, onChange }: RevealEditorProps) {
  if (reveal === undefined) {
    return (
      <button
        className="reveal-editor__add"
        type="button"
        aria-label={`Add reveal to ${name}`}
        onClick={() => onChange({})}
      >
        + Reveal
      </button>
    )
  }

  // An absent field means "not authored", so a cleared control deletes its key
  // rather than storing an empty string. An emptied reveal stays `{}` — that is
  // an overlay showing the label, which is not the same as no reveal.
  const patch = (next: Partial<Reveal>) => {
    const merged: Reveal = { ...reveal, ...next }
    for (const key of Object.keys(merged) as (keyof Reveal)[]) {
      if (merged[key] === undefined) delete merged[key]
    }
    onChange(merged)
  }

  const media = reveal.media

  return (
    <div className="reveal-editor">
      <input
        className="reveal-editor__headline"
        aria-label={`Reveal headline for ${name}`}
        placeholder={name}
        value={reveal.headline ?? ''}
        onChange={(event) => patch({ headline: event.target.value || undefined })}
      />
      <input
        className="reveal-editor__body"
        aria-label={`Reveal body for ${name}`}
        placeholder="body"
        value={reveal.body ?? ''}
        onChange={(event) => patch({ body: event.target.value || undefined })}
      />
      <select
        className="reveal-editor__kind"
        aria-label={`Reveal media kind for ${name}`}
        value={media?.kind ?? 'emoji'}
        onChange={(event) => {
          const kind = event.target.value as Media['kind']
          patch({ media: media === undefined ? undefined : { ...media, kind } })
        }}
      >
        {KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {kind}
          </option>
        ))}
      </select>
      <input
        className="reveal-editor__media"
        aria-label={`Reveal media value for ${name}`}
        placeholder="emoji or URL"
        value={media?.value ?? ''}
        onChange={(event) => {
          const value = event.target.value
          patch({ media: value === '' ? undefined : { kind: media?.kind ?? 'emoji', value } })
        }}
      />
      <input
        className="reveal-editor__hold"
        type="number"
        min={0}
        step={250}
        aria-label={`Reveal hold for ${name}`}
        placeholder="hold ms"
        value={reveal.holdMs ?? ''}
        onChange={(event) => {
          const holdMs = Number.parseFloat(event.target.value)
          patch({ holdMs: Number.isFinite(holdMs) && holdMs > 0 ? holdMs : undefined })
        }}
      />
      <button
        type="button"
        aria-label={`Remove reveal from ${name}`}
        onClick={() => onChange(undefined)}
      >
        ×
      </button>
    </div>
  )
}
