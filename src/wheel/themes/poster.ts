import type { Theme } from '../theme'

/**
 * A screen-printed wheel: matte charcoal rim, bone pegs and hub, no gloss. It
 * leaves the wedges to carry the look, which is what a wheel whose every face
 * is set in its own style wants.
 */
export const poster: Theme = {
  id: 'poster',
  name: 'Poster',
  parts: {
    stage: true,
    shadow: true,
    rim: true,
    face: true,
    divider: true,
    'inner-shadow': true,
    peg: true,
    hub: true,
    flapper: true,
  },
  metrics: { rimWidth: 10, pegRadius: 2.4, hubRadius: 40, panel: [0.33, 0.87] },
  tokens: {
    '--wheel-stage-fill': '#121015',
    '--wheel-stage-ink': '#ece4d0',
    '--wheel-shadow': 'drop-shadow(0 12px 18px rgb(0 0 0 / 0.55))',
    '--wheel-rim-fill': '#24202a',
    '--wheel-face-fill': '#121015',
    '--wheel-inner-shadow-fill': 'url(#wheel-inner)',
    '--wheel-peg-fill': '#ece4d0',
    '--wheel-peg-stroke': '#24202a',
    '--wheel-hub-fill': '#ece4d0',
    '--wheel-hub-stroke': '#24202a',
    '--wheel-flapper-fill': '#ece4d0',
    '--wheel-flapper-stroke': '#24202a',
    '--wedge-divider-stroke': '#121015',
    '--wheel-label-color': '#121015',
    '--wheel-segment-stroke': 'transparent',
  },
  pegs: { kind: 'bounds' },
  flapper: 'click',
  font: 'archivo-black',
}
