import type { Morph } from '../../wheel/types'
import { readString, readUnit } from '../params'
import type { Recipe, RecipeContext, TrickParams, Write } from '../types'

const DEFAULT_AT = 0.95

/** The pair this trick acts on, or null when there is nothing to trade. */
function pair(params: TrickParams, ctx: RecipeContext) {
  if (ctx.winnerId === null) return null
  const otherId = readString(params, 'otherWedgeId', '')
  // Trading a wedge with itself is a no-op that would otherwise produce two
  // contradictory morphs on one id.
  if (otherId === '' || otherId === ctx.winnerId) return null
  const winner = ctx.segments.find((segment) => segment.id === ctx.winnerId)
  const other = ctx.segments.find((segment) => segment.id === otherId)
  if (!winner || !other) return null
  const winnerColor = winner.color
  const otherColor = other.color
  if (winnerColor === undefined || otherColor === undefined) return null
  return { winner, other, winnerColor, otherColor }
}

export const swap: Recipe = {
  id: 'swap',
  name: 'Two wedges trade identities',
  description:
    'The winner and one other wedge exchange names, colors, and reveals just before the wheel lands.',
  defaults: { otherWedgeId: '', at: DEFAULT_AT },
  fields: [
    { key: 'otherWedgeId', label: 'Trades with', kind: 'segment' },
    { key: 'at', label: 'Fires at', kind: 'slider', min: 0, max: 1, step: 0.01 },
  ],

  provides: () => [],

  resolve(params, ctx): Morph[] {
    const trade = pair(params, ctx)
    if (!trade) return []
    const at = readUnit(params, 'at', DEFAULT_AT)
    const { winner, other, winnerColor, otherColor } = trade
    // Two keyframes on one offset per wedge: the first holds the wedge as
    // itself, the second is what it becomes. A zero-length span makes `bracket`
    // return t = 1, so the identity snaps instead of fading — a fade would show
    // the audience the switch coming.
    return [
      {
        segmentId: winner.id,
        durationMs: ctx.durationMs,
        keyframes: [
          { at, label: winner.label, color: winnerColor, reveal: winner.reveal ?? null },
          { at, label: other.label, color: otherColor, reveal: other.reveal ?? null },
        ],
      },
      {
        segmentId: other.id,
        durationMs: ctx.durationMs,
        keyframes: [
          { at, label: other.label, color: otherColor, reveal: other.reveal ?? null },
          { at, label: winner.label, color: winnerColor, reveal: winner.reveal ?? null },
        ],
      },
    ]
  },

  writes(params, ctx): Write[] {
    const otherId = readString(params, 'otherWedgeId', '')
    if (otherId === '') return []
    const claims: Write[] = [
      { segmentId: otherId, property: 'label' },
      { segmentId: otherId, property: 'color' },
      { segmentId: otherId, property: 'reveal' },
    ]
    if (ctx.winnerId !== null && ctx.winnerId !== otherId) {
      claims.push(
        { segmentId: ctx.winnerId, property: 'label' },
        { segmentId: ctx.winnerId, property: 'color' },
        { segmentId: ctx.winnerId, property: 'reveal' },
      )
    }
    return claims
  },

  validate(params, wedges) {
    const id = readString(params, 'otherWedgeId', '')
    if (id === '') return 'no wedge chosen'
    return wedges.has(id) ? null : `unknown wedge: ${id}`
  },
}
