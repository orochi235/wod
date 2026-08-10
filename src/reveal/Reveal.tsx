import { useEffect, useRef, useState } from 'react'
import type { Media, Reveal as RevealData, Segment } from '../wheel/types'
import './Reveal.css'

export type RevealProps = {
  segment: Segment
  reveal: RevealData
  onDismiss: () => void
}

function MediaView({ media }: { media: Media }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  if (media.kind === 'emoji') return <span className="reveal__emoji">{media.value}</span>
  // Decorative: the headline already carries the meaning, and alt text repeating
  // it would be read out twice.
  return <img className="reveal__image" src={media.value} alt="" onError={() => setFailed(true)} />
}

export function Reveal({ segment, reveal, onDismiss }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const headline = reveal.headline ?? segment.label

  // Focus on mount, or Escape never reaches the handler below.
  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <div
      className="reveal"
      ref={ref}
      // biome-ignore lint/a11y/useSemanticElements: a native <dialog> owns its
      // own open state, which would compete with useReveal for the same answer.
      role="dialog"
      aria-modal="true"
      aria-label={headline}
      tabIndex={-1}
      onClick={onDismiss}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDismiss()
      }}
    >
      <div className="reveal__card">
        <h2 className="reveal__headline">{headline}</h2>
        {reveal.body === undefined ? null : <p className="reveal__body">{reveal.body}</p>}
        {reveal.media === undefined ? null : <MediaView media={reveal.media} />}
      </div>
    </div>
  )
}
