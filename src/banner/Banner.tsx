import { useEffect, useRef } from 'react'
import './Banner.css'

export type BannerProps = {
  /** What the type on the overlay spells. */
  label: string
  onDismiss: () => void
}

/**
 * The scrim under the winner's name. The type itself is drawn by klieg,
 * onto its own click-through canvas above everything; this is what makes that
 * modal — it takes the click, and it is the only thing on the page that can.
 */
export function Banner({ label, onDismiss }: BannerProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Focus on mount, or Escape never reaches the handler below.
  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <div
      className="banner"
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      onClick={onDismiss}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDismiss()
      }}
    />
  )
}
