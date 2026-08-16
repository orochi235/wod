import type { Theme } from '../theme'

/**
 * The named paints are `url(#…)` references into the `defs` block `Wheel.tsx`
 * renders. A gradient cannot be written as a custom property, so the token
 * chooses among them instead of describing one.
 */
export const wof: Theme = {
  id: 'wof',
  name: 'Fortunate',
  parts: {
    stage: true,
    shadow: true,
    rim: true,
    face: true,
    divider: true,
    panel: false,
    'inner-shadow': true,
    sheen: true,
    peg: true,
    hub: true,
    pointer: false,
    flapper: true,
  },
  metrics: {
    rimWidth: 18,
    pegRadius: 4.4,
    hubRadius: 30,
    panel: [0.33, 0.87],
  },
  tokens: {
    '--wheel-stage-fill': '#0b0f1c',
    '--wheel-shadow': 'drop-shadow(0 14px 16px rgb(0 0 0 / 0.6))',
    '--wheel-rim-fill': 'url(#wheel-gold)',
    '--wheel-face-fill': '#14181f',
    '--wheel-inner-shadow-fill': 'url(#wheel-inner)',
    '--wheel-sheen-fill': 'url(#wheel-sheen)',
    '--wheel-peg-fill': 'url(#wheel-chrome)',
    '--wheel-peg-stroke': '#39414d',
    '--wheel-hub-fill': 'url(#wheel-hub)',
    '--wheel-hub-stroke': '#1c2128',
    '--wheel-flapper-fill': 'url(#wheel-chrome)',
    '--wheel-flapper-stroke': '#39414d',
    '--wedge-panel-fill': 'url(#wheel-gloss)',
    '--wedge-panel-stroke': 'rgb(255 255 255 / 0.65)',
    '--wedge-divider-stroke': '#0d1017',
    '--wheel-label-color': '#12151b',
    '--wheel-segment-stroke': 'transparent',
  },
  pegs: { kind: 'bounds' },
  flapper: 'click',
  font: 'bevan',
}
