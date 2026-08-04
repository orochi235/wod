import type { Origin } from '../compose/types'
import type { Segment } from '../wheel/types'

/**
 * Selectors ride as reserved ids inside the string arrays tricks and branches
 * already store, so nothing migrates. Id generation never emits '@', so a real
 * wedge cannot collide with one.
 */
export const SELECTOR_TOKENS = [
  '@all',
  '@static',
  '@external',
  '@computed',
  '@randomExternal',
] as const

export type SelectorToken = (typeof SELECTOR_TOKENS)[number]

export function isSelectorToken(id: string): id is SelectorToken {
  return (SELECTOR_TOKENS as readonly string[]).includes(id)
}

export type TargetContext = {
  segments: Segment[]
  origins: Map<string, Origin>
  /** The resolution's frozen roll. See resolveScriptedSpin. */
  roll: number
}

function byOrigin(ctx: TargetContext, kind: Origin['kind']): Segment[] {
  // A wedge with no recorded origin is treated as static: that is what an
  // unrecorded wedge was before feeds existed, and guessing 'external' would
  // put it in the path of tricks aimed at the roster.
  return ctx.segments.filter((segment) => (ctx.origins.get(segment.id)?.kind ?? 'static') === kind)
}

/**
 * Expands selector tokens and concrete ids into wedges. Empty means every
 * wedge, which is the convention the recipes used before selectors existed.
 *
 * Weight is irrelevant here: a wedge sitting at zero is still on the wheel and
 * still selectable, which is exactly what lets a trick grow one.
 */
export function resolveTargets(ids: string[], ctx: TargetContext): Segment[] {
  if (ids.length === 0) return ctx.segments

  const picked = new Set<string>()
  const add = (segments: Segment[]) => {
    for (const segment of segments) picked.add(segment.id)
  }

  for (const id of ids) {
    switch (id) {
      case '@all':
        add(ctx.segments)
        break
      case '@static':
        add(byOrigin(ctx, 'static'))
        break
      case '@external':
        add(byOrigin(ctx, 'external'))
        break
      case '@computed':
        add(byOrigin(ctx, 'computed'))
        break
      case '@randomExternal': {
        const candidates = byOrigin(ctx, 'external')
        if (candidates.length === 0) break
        // Math.min guards a roll of exactly 1, which Rng promises never to
        // return but a hand-supplied one might.
        const index = Math.min(candidates.length - 1, Math.floor(ctx.roll * candidates.length))
        picked.add(candidates[index].id)
        break
      }
      default: {
        if (ctx.segments.some((segment) => segment.id === id)) picked.add(id)
      }
    }
  }

  // Wheel order, not selection order: morphs read better when they follow the
  // order the wedges actually appear in.
  return ctx.segments.filter((segment) => picked.has(segment.id))
}
