import { blackoutKeyframes, blackoutMs } from './schedule'
import './blackout.css'

export type Blackout = { stop(): void }

/**
 * Blacks out the window `delayMs` from now, flickers it on the schedule, and
 * lifts it on the chord. `depth` is how dark it gets: 1 on the show page.
 */
export function playBlackout(delayMs: number, depth: number, doc: Document = document): Blackout {
  const cover = doc.createElement('div')
  cover.className = 'outage-blackout'
  cover.setAttribute('aria-hidden', 'true')
  doc.body.appendChild(cover)
  const animation = cover.animate(blackoutKeyframes(depth), {
    duration: blackoutMs(),
    delay: Math.max(0, delayMs),
    easing: 'linear',
  })
  const stop = () => {
    animation.cancel()
    cover.remove()
  }
  animation.finished.then(stop, stop)
  return { stop }
}
