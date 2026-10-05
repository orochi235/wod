import { type Motion, WHEEL } from '../clock/motion'
import { blackoutVoice } from './voices'
import './blackout.css'

export type Blackout = { stop(): void }

/** The window's blackout layer, at whatever darkness it is told. */
export type BlackoutCover = { set(darkness: number): void; remove(): void }

export function createBlackoutCover(doc: Document = document): BlackoutCover {
  const cover = doc.createElement('div')
  cover.className = 'outage-blackout'
  cover.setAttribute('aria-hidden', 'true')
  doc.body.appendChild(cover)
  return {
    set: (darkness) => cover.style.setProperty('--blackout', String(darkness)),
    remove: () => cover.remove(),
  }
}

/**
 * Blacks out the window from `startAt` on the motion's clock, flickers it on the
 * schedule, and lifts it on the chord. `depth` is how dark it gets: 1 on the show page.
 */
export function cueBlackout(
  motion: Motion,
  startAt: number,
  depth: number,
  doc: Document = document,
): Blackout {
  const { ticker, wheel } = motion
  const cover = createBlackoutCover(doc)
  const voice = wheel.cue(blackoutVoice(depth, startAt))
  const release = ticker.stay()
  const off = ticker.subscribe(() => {
    cover.set(wheel.probe(WHEEL).blackout ?? 0)
  })

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    off()
    release()
    voice.fade({ over: 0 })
    cover.remove()
  }
  void voice.done.then(stop)
  return { stop }
}
