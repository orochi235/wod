import type { Origin } from '../compose/types'
import type { Segment } from '../wheel/types'

/**
 * Selectors ride as reserved ids inside the string arrays tricks and branches
 * already store, so nothing migrates. Id generation never emits '@', and
 * `readSegments` drops an imported wedge that claims one, so a real wedge
 * cannot collide with a token from either direction.
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
  // Defaulting an unrecorded wedge to static makes the three kinds a total
  // partition of the wheel, which is what makes '@all' equal '@static' plus
  // '@external' plus '@computed' unconditionally rather than by luck. Both
  // composeBase and resolveTricks always record an origin, so the default is
  // unreachable in production; it is what keeps a fixture built with an empty
  // map coherent instead of invisible to every selector.
  return ctx.segments.filter((segment) => (ctx.origins.get(segment.id)?.kind ?? 'static') === kind)
}

/**
 * Clamped at both ends. `Rng` promises [0, 1), but a roll can also arrive from
 * a hand-built context or an imported preset, and an out-of-range index would
 * read `undefined` off the candidate list and throw. NaN is caught separately
 * because it fails every comparison, so Math.min and Math.max both pass it
 * through untouched.
 */
function rollIndex(roll: number, count: number): number {
  if (Number.isNaN(roll)) return 0
  return Math.min(count - 1, Math.max(0, Math.floor(roll * count)))
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
        picked.add(candidates[rollIndex(ctx.roll, candidates.length)].id)
        break
      }
      default: {
        if (ctx.segments.some((segment) => segment.id === id)) picked.add(id)
      }
    }
  }

  // Wheel order, not selection order. The result must not depend on which order
  // the operator happened to click the tokens and ids in, or the same target set
  // would compile to a different morph array depending on how it was authored.
  return ctx.segments.filter((segment) => picked.has(segment.id))
}
