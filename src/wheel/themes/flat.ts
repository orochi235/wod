import { FLAT_METRICS } from '../theme'
import type { Theme } from '../theme'

/** Today's wheel. Nothing is added, so a preset with no theme renders unchanged. */
export const flat: Theme = {
  id: 'flat',
  name: 'Flat',
  parts: {
    stage: false,
    shadow: false,
    rim: false,
    face: false,
    divider: false,
    panel: false,
    'inner-shadow': false,
    sheen: false,
    peg: false,
    hub: false,
    flapper: false,
  },
  metrics: FLAT_METRICS,
  tokens: {},
  pegs: { kind: 'fixed', count: 0 },
  flapper: 'silent',
}
