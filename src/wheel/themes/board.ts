import type { Theme } from '../theme'
import { wof } from './wof'

/**
 * Fortunate, on a board rather than a roster. Two dozen faces converge on a
 * point a roster's five never reach, so the cap that covers them is the one
 * thing that has to be bigger — a hub sized for six wedges leaves a knot of
 * seams showing under twenty-four.
 *
 * A look rather than a preset field: metrics belong to the look, and one number
 * is not worth a per-preset override of every other one.
 */
export const board: Theme = {
  ...wof,
  id: 'board',
  name: 'Fortunate board',
  metrics: { ...wof.metrics, hubRadius: 50 },
}
