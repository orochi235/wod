import { assert, describe, expect, it, vi } from 'vitest'
import { composeBase } from '../compose/compose'
import type { Composition } from '../compose/types'
import type { SimulatedFeedConfig } from '../feed/types'
import type { BranchAction, BranchNode, ScriptedSpin } from '../preset/types'
import { RECIPES } from '../tricks/registry'
import type { Trick } from '../tricks/types'
import { landingSegments } from '../wheel/morph'
import type { Rng } from '../wheel/selection'
import type { Morph, Segment } from '../wheel/types'
import { MAX_DEPTH, resolveScriptedSpin } from './resolve'

const people: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
  { id: 'cal', label: 'Cal', weight: 1 },
]

const base = composeBase({ statics: people, feeds: [], items: {}, overrides: {} })

const feed: SimulatedFeedConfig = {
  kind: 'simulated',
  id: 'sim',
  defaults: { weight: 1 },
  pool: [],
  autochurn: { intervalMs: 1000, targetSize: 3, volatility: 0 },
}

/** Statics plus a live roster, so a condition's token has both kinds to tell apart. */
function withRoster(statics: Segment[], names: string[]): Composition {
  return composeBase({
    statics,
    feeds: [feed],
    items: { sim: names.map((name) => ({ id: name.toLowerCase(), label: name })) },
    overrides: {},
  })
}

const spin: ScriptedSpin = {
  target: { kind: 'fair' },
  motion: { durationMs: 4000, turns: 5, direction: 'cw', easing: [0, 0, 1, 1] },
}

/** Always returns the same value, so the fair draw is predictable. */
const fixed =
  (value: number): Rng =>
  () =>
    value

/**
 * A chain of `length` nodes, each matching ana and routing to the next, with an
 * optional action on the outermost one. Built inside-out, so `n1` is the root.
 */
function anaChain(length: number, rootAction?: BranchAction): BranchNode[] {
  let level: BranchNode[] = []
  for (let i = length; i > 0; i--) {
    const node: BranchNode = {
      id: `n${i}`,
      when: { kind: 'landsOn', segmentIds: ['ana'] },
      // biome-ignore lint/suspicious/noThenProperty: `then` is BranchNode's routing field, not a thenable.
      then: level,
    }
    if (i === 1 && rootAction) node.do = rootAction
    level = [node]
  }
  return level
}

describe('resolveScriptedSpin', () => {
  it('settles immediately when there are no branches', () => {
    const result = resolveScriptedSpin(base, [], spin, [], fixed(0.1))
    expect(result?.kind).toBe('settled')
    expect(result?.winnerId).toBe('ana')
  })

  it('returns null when there is nothing to spin', () => {
    expect(
      resolveScriptedSpin(
        composeBase({ statics: [], feeds: [], items: {}, overrides: {} }),
        [],
        spin,
        [],
        fixed(0.1),
      ),
    ).toBeNull()
  })

  it('honors a forced target', () => {
    const rigged: ScriptedSpin = { ...spin, target: { kind: 'forced', segmentId: 'cal' } }
    expect(resolveScriptedSpin(base, [], rigged, [], fixed(0.1))?.winnerId).toBe('cal')
  })

  it('re-targets when a branch matches', () => {
    const branches: BranchNode[] = [
      {
        id: 'escape',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'cal' } } },
      },
    ]
    expect(resolveScriptedSpin(base, [], spin, branches, fixed(0.1))?.winnerId).toBe('cal')
  })

  it('leaves the spin alone when no branch matches', () => {
    const branches: BranchNode[] = [
      {
        id: 'never',
        when: { kind: 'landsOn', segmentIds: ['ben'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'cal' } } },
      },
    ]
    expect(resolveScriptedSpin(base, [], spin, branches, fixed(0.1))?.winnerId).toBe('ana')
  })

  it('replaces motion wholesale', () => {
    const branches: BranchNode[] = [
      {
        id: 'reverse',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: {
          kind: 'replace',
          spin: {
            target: { kind: 'forced', segmentId: 'ben' },
            motion: { durationMs: 1000, turns: 2, direction: 'ccw', easing: [0, 0, 0.58, 1] },
          },
        },
      },
    ]
    const result = resolveScriptedSpin(base, [], spin, branches, fixed(0.1))
    expect(result?.motion.direction).toBe('ccw')
    expect(result?.motion.turns).toBe(2)
    expect(result?.winnerId).toBe('ben')
  })

  it('patches only the named motion fields', () => {
    const branches: BranchNode[] = [
      {
        id: 'slow',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { motion: { direction: 'ccw' } } },
      },
    ]
    const result = resolveScriptedSpin(base, [], spin, branches, fixed(0.1))
    expect(result?.motion.direction).toBe('ccw')
    expect(result?.motion.turns).toBe(5)
    expect(result?.motion.easing).toEqual([0, 0, 1, 1])
  })

  it('descends into children against the post-modify landing', () => {
    // The parent re-targets to cal, so only a child asking about cal can fire.
    // The sibling that would have matched the ORIGINAL winner must not.
    const branches: BranchNode[] = [
      {
        id: 'parent',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'cal' } } },
        // biome-ignore lint/suspicious/noThenProperty: `then` is BranchNode's routing field, not a thenable.
        then: [
          {
            id: 'child-sees-cal',
            when: { kind: 'landsOn', segmentIds: ['cal'] },
            do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'ben' } } },
          },
          {
            id: 'child-sees-ana',
            when: { kind: 'landsOn', segmentIds: ['ana'] },
            do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'ana' } } },
          },
        ],
      },
    ]
    expect(resolveScriptedSpin(base, [], spin, branches, fixed(0.1))?.winnerId).toBe('ben')
  })

  it('does not re-scan siblings after descending', () => {
    // 'second' would match the re-targeted winner, but the walk has already
    // moved down a level and never looks back up. This is what makes the walk
    // terminate by construction.
    const branches: BranchNode[] = [
      {
        id: 'first',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'cal' } } },
      },
      {
        id: 'second',
        when: { kind: 'landsOn', segmentIds: ['cal'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'ben' } } },
      },
    ]
    expect(resolveScriptedSpin(base, [], spin, branches, fixed(0.1))?.winnerId).toBe('cal')
  })

  it('takes the first matching sibling, not the last', () => {
    // Both siblings match the same winner, so only ordering can decide. Sibling
    // order is authored meaning; a walk that scanned from the end would silently
    // run the wrong rule whenever two conditions overlap.
    const branches: BranchNode[] = [
      {
        id: 'first',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'ben' } } },
      },
      {
        id: 'also',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'cal' } } },
      },
    ]
    expect(resolveScriptedSpin(base, [], spin, branches, fixed(0.1))?.winnerId).toBe('ben')
  })

  it('enables a trick through a modifier', () => {
    const tricks: Trick[] = [
      {
        id: 'beer',
        name: 'slow burn',
        recipe: 'takeover',
        params: {
          wedgeMode: 'new',
          wedgeLabel: 'free beer',
          wedgeColor: '#ffd166',
          wedgeSegmentId: '',
          holdUntil: 0.6,
          endShare: 1,
          endColor: '',
          easing: 'easeIn',
        },
        enabled: false,
      },
    ]
    const branches: BranchNode[] = [
      {
        id: 'beer-time',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { enableTricks: ['beer'] } },
      },
    ]
    const result = resolveScriptedSpin(base, tricks, spin, branches, fixed(0.1))
    // The takeover wedge swallows the wheel, so it must be the winner.
    expect(result?.winnerId).toBe('beer:wedge')
    expect(result?.morphs.length).toBeGreaterThan(0)
    // The wedge must also be in the returned segments. `planSpin` receives this
    // list and looks the winner up in it; a winner with no arc there degrades to
    // a fair draw, and the announced winner stops matching where it lands.
    expect(result?.segments.map((segment) => segment.id)).toContain('beer:wedge')
  })

  it('disables a baseline-enabled trick through a modifier', () => {
    const tricks: Trick[] = [
      {
        id: 'gone',
        name: 'vanishing act',
        recipe: 'vanish',
        params: { targets: ['ana'], startAt: 0, easing: 'linear' },
        enabled: true,
      },
    ]
    // With the trick on, ana vanishes and cannot win. Turning it off restores her.
    const withTrick = resolveScriptedSpin(base, tricks, spin, [], fixed(0.1))
    expect(withTrick?.winnerId).not.toBe('ana')

    const branches: BranchNode[] = [
      {
        id: 'spare-her',
        when: { kind: 'landsOn', segmentIds: [withTrick?.winnerId ?? ''] },
        do: { kind: 'modify', modifier: { disableTricks: ['gone'] } },
      },
    ]
    const result = resolveScriptedSpin(base, tricks, spin, branches, fixed(0.1))
    expect(result?.morphs).toEqual([])
    expect(result?.winnerId).toBe('ana')
  })

  it('draws once for the winner and once for selectors, however deep the walk', () => {
    // A counting rng proves the resolver draws a fixed number of times no matter
    // how many times it re-evaluates: two up front, then nothing per depth.
    // Re-rolling inside the loop would move the winner for reasons the operator
    // did not author. The count is 2 rather than 1 because selectors must not
    // share the winner's draw — see the comment on resolveScriptedSpin.
    const drawsFor = (branches: BranchNode[]) => {
      let calls = 0
      const counting: Rng = () => {
        calls++
        return 0.1
      }
      resolveScriptedSpin(base, [], spin, branches, counting)
      return calls
    }

    const shallow: BranchNode[] = [
      {
        id: 'a',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { motion: { turns: 9 } } },
        // biome-ignore lint/suspicious/noThenProperty: `then` is BranchNode's routing field, not a thenable.
        then: [{ id: 'b', when: { kind: 'landsOn', segmentIds: ['ana'] } }],
      },
    ]
    // Holding the count flat from no branches to a full-depth chain is what pins
    // the property. A bare number would also be satisfied by a resolver that drew
    // once per pass over a fixture that happened to make two passes.
    expect(drawsFor([])).toBe(2)
    expect(drawsFor(shallow)).toBe(2)
    expect(drawsFor(anaChain(MAX_DEPTH - 1))).toBe(2)
  })

  it('hands every recipe that same roll at every depth', () => {
    // Freezing the draw only matters if it reaches recipes: selectors resolve
    // against `ctx.roll`, so a re-roll per depth would reshuffle one trick's
    // pick because an unrelated modifier fired deeper in the tree.
    const seen: number[] = []
    const spy = vi.spyOn(RECIPES.recolor, 'resolve').mockImplementation((_params, ctx) => {
      seen.push(ctx.roll)
      return []
    })

    const tricks: Trick[] = [
      { id: 'gray', name: 'gray', recipe: 'recolor', params: {}, enabled: true },
    ]
    const branches: BranchNode[] = [
      {
        id: 'a',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { motion: { turns: 9 } } },
        // biome-ignore lint/suspicious/noThenProperty: `then` is BranchNode's routing field, not a thenable.
        then: [{ id: 'b', when: { kind: 'landsOn', segmentIds: ['ana'] } }],
      },
    ]

    resolveScriptedSpin(base, tricks, spin, branches, fixed(0.1))

    // More than one evaluation, all of them the same draw.
    expect(seen.length).toBeGreaterThan(1)
    expect(new Set(seen)).toEqual(new Set([0.1]))
    spy.mockRestore()
  })

  it('ignores every draw after the first', () => {
    // A drifting rng must resolve exactly as a fixed one: the walk re-evaluates,
    // and a second draw would move the winner for reasons no modifier authored.
    //
    // The fixture has to earn this. The node patches motion rather than target,
    // so the second pass is still a fair draw that would consume another number
    // — re-targeting would call `forced`, which short-circuits before the rng and
    // would let the drift pass unnoticed. A roll of 0.42 lands on ben.
    let n = 0
    const drifting: Rng = () => [0.42, 0.99, 0.01][n++] ?? 0.5
    const branches: BranchNode[] = [
      {
        id: 'slow-down',
        when: { kind: 'landsOn', segmentIds: ['ben'] },
        do: { kind: 'modify', modifier: { motion: { turns: 9 } } },
      },
    ]
    const drifted = resolveScriptedSpin(base, [], spin, branches, drifting)
    const fixedResult = resolveScriptedSpin(base, [], spin, branches, fixed(0.42))
    // resolveLate closes over each call's own frozen rolls, so it is compared by
    // presence rather than identity — the rest of the resolution is what the
    // drift must not move.
    const { resolveLate: _driftedLate, ...driftedRest } = drifted ?? {}
    const { resolveLate: _fixedLate, ...fixedRest } = fixedResult ?? {}
    expect(driftedRest).toEqual(fixedRest)
    expect(drifted?.resolveLate).toBeInstanceOf(Function)
    expect(fixedResult?.resolveLate).toBeInstanceOf(Function)
    // Vacuous if the branch never fired, which would mean only one evaluation ran.
    expect(drifted?.motion.turns).toBe(9)
    expect(drifted?.winnerId).toBe('ben')
  })

  it('keeps the selector roll off the winner, so a random trick cannot spoil it', () => {
    // A shared draw made '@randomExternal' pick exactly the wedge weightedRandom
    // was about to: on an equal-weight roster both reduce to floor(roll * n) over
    // the same list, so they agreed every time. Morphs animate during the spin,
    // so the trick painted the winner gold before the wheel landed — the leak
    // that choosing the winner up front exists to prevent.
    const roster: Composition = {
      segments: people,
      origins: new Map(
        people.map((segment) => [
          segment.id,
          { kind: 'external', feedId: 'sim', itemId: segment.id } as const,
        ]),
      ),
    }
    const tricks: Trick[] = [
      {
        id: 'gold',
        name: 'gold',
        recipe: 'recolor',
        params: { targets: ['@randomExternal'], toColor: '#ffd700' },
        enabled: true,
      },
    ]
    // First draw picks the winner, second picks the target. 0.1 lands on ana,
    // 0.9 selects cal — a fixed rng cannot show this, since it makes the two
    // agree for the honest reason.
    let n = 0
    const twoDraws: Rng = () => [0.1, 0.9][n++] ?? 0.5
    const result = resolveScriptedSpin(roster, tricks, spin, [], twoDraws)
    expect(result?.winnerId).toBe('ana')
    expect(result?.morphs.map((morph) => morph.segmentId)).toEqual(['cal'])
  })

  it('settles on the deepest chain that still fits under the cap', () => {
    // The boundary, not just "deep exhausts". Each pass consumes one level and a
    // final pass finds no node, so MAX_DEPTH - 1 nodes is the longest legal chain.
    // An off-by-one here makes deep-but-valid trees stop descending and report
    // exhausted, which is a wrong answer that looks like a working one.
    const result = resolveScriptedSpin(base, [], spin, anaChain(MAX_DEPTH - 1), fixed(0.1))
    expect(result?.kind).toBe('settled')
    expect(result?.winnerId).toBe('ana')
  })

  it('reports exhausted past the depth cap, carrying the modified spin', () => {
    // The outermost node patches the motion so the exhausted arm has something to
    // be wrong about: a tail that re-read the original spin would still say cw/5.
    const deepest = anaChain(MAX_DEPTH + 2, {
      kind: 'modify',
      modifier: { motion: { turns: 9, direction: 'ccw' } },
    })
    const result = resolveScriptedSpin(base, [], spin, deepest, fixed(0.1))
    assert(result?.kind === 'exhausted')
    expect(result.winnerId).toBe('ana')
    expect(result.depth).toBe(MAX_DEPTH)
    expect(result.motion.turns).toBe(9)
    expect(result.motion.direction).toBe('ccw')
  })

  it('expands a selector token in a branch condition', () => {
    // A feed-only wheel: the only wedge is an attendee, so '@external' is the
    // only way to write a rule about whoever is in the room. Matching the raw
    // id list never fired, which made every branch on a live roster dead.
    const roster = withRoster([], ['Ana'])
    const branches: BranchNode[] = [
      {
        id: 'attendee',
        when: { kind: 'landsOn', segmentIds: ['@external'] },
        do: { kind: 'modify', modifier: { motion: { turns: 99 } } },
      },
    ]
    const result = resolveScriptedSpin(roster, [], spin, branches, fixed(0.1))
    expect(result?.winnerId).toBe('sim:ana')
    expect(result?.motion.turns).toBe(99)
  })

  it('tells the two origins apart in a condition', () => {
    // The same wheel and the same rigged winner, so only the token can decide.
    const mixed = withRoster([{ id: 'again', label: 'Spin again', weight: 1 }], ['Ana'])
    const rigged: ScriptedSpin = { ...spin, target: { kind: 'forced', segmentId: 'again' } }
    const on = (token: string): BranchNode[] => [
      {
        id: 'rule',
        when: { kind: 'landsOn', segmentIds: [token] },
        do: { kind: 'modify', modifier: { motion: { turns: 99 } } },
      },
    ]

    expect(resolveScriptedSpin(mixed, [], rigged, on('@external'), fixed(0.1))?.motion.turns).toBe(
      spin.motion.turns,
    )
    expect(resolveScriptedSpin(mixed, [], rigged, on('@static'), fixed(0.1))?.motion.turns).toBe(99)
  })

  it('still matches a concrete id alongside a token', () => {
    // Concrete ids are the only form that existed before selectors, so mixing
    // one in has to keep resolving exactly as it did — the token must not
    // become the whole condition.
    const mixed = withRoster([{ id: 'again', label: 'Spin again', weight: 1 }], ['Ana'])
    const branches: BranchNode[] = [
      {
        id: 'either',
        when: { kind: 'landsOn', segmentIds: ['@computed', 'again'] },
        do: { kind: 'modify', modifier: { motion: { turns: 99 } } },
      },
    ]
    const rigged = (segmentId: string): ScriptedSpin => ({
      ...spin,
      target: { kind: 'forced', segmentId },
    })

    expect(
      resolveScriptedSpin(mixed, [], rigged('again'), branches, fixed(0.1))?.motion.turns,
    ).toBe(99)
    expect(
      resolveScriptedSpin(mixed, [], rigged('sim:ana'), branches, fixed(0.1))?.motion.turns,
    ).toBe(spin.motion.turns)
  })

  it('draws @randomExternal in a condition from the selector roll', () => {
    // Same fixture, same winner, two different second draws. Matching on the
    // winner's own roll would make the token name the winner every time on an
    // equal-weight roster — the correlation the second draw exists to break.
    const roster = withRoster([], ['Ana', 'Ben', 'Cal'])
    const branches: BranchNode[] = [
      {
        id: 'chosen',
        when: { kind: 'landsOn', segmentIds: ['@randomExternal'] },
        do: { kind: 'modify', modifier: { motion: { turns: 99 } } },
      },
    ]
    const draws = (values: number[]): ReturnType<typeof resolveScriptedSpin> => {
      let n = 0
      return resolveScriptedSpin(roster, [], spin, branches, () => values[n++] ?? 0.5)
    }

    // 0.1 wins ana in both runs; the selector picks cal, then ana.
    const missed = draws([0.1, 0.9])
    expect(missed?.winnerId).toBe('sim:ana')
    expect(missed?.motion.turns).toBe(spin.motion.turns)

    const hit = draws([0.1, 0.1])
    expect(hit?.winnerId).toBe('sim:ana')
    expect(hit?.motion.turns).toBe(99)
  })

  it('lets enable win when one modifier names a trick in both lists', () => {
    // The deliberate tie-break, pinned so the comment on `applyTrickDeltas` and
    // the behavior cannot drift apart. Nothing forbids the overlap, so it needs
    // a defined answer rather than whichever loop happens to run last.
    const tricks: Trick[] = [
      {
        id: 'gone',
        name: 'vanishing act',
        recipe: 'vanish',
        params: { targets: ['ana'], startAt: 0, easing: 'linear' },
        enabled: false,
      },
    ]
    const branches: BranchNode[] = [
      {
        id: 'both',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { enableTricks: ['gone'], disableTricks: ['gone'] } },
      },
    ]
    const result = resolveScriptedSpin(base, tricks, spin, branches, fixed(0.1))
    // The trick ran, so ana vanished and someone else took the landing.
    expect(result?.morphs.length).toBeGreaterThan(0)
    expect(result?.winnerId).toBe('ben')
  })

  it('reproduces the first pass exactly, plus the swap', () => {
    const tricks: Trick[] = [
      {
        id: 's',
        name: 'swap',
        recipe: 'swap',
        params: { otherWedgeId: 'ben', at: 0.95 },
        enabled: true,
      },
      {
        id: 'r',
        name: 'relabel',
        recipe: 'relabel',
        params: { targets: ['cal'], at: 0.5 },
        enabled: true,
      },
    ]
    const result = resolveScriptedSpin(base, tricks, spin, [], fixed(0.1))
    if (!result) throw new Error('expected a resolution')

    const late = result.resolveLate(result.winnerId)
    const unchanged = (morphs: Morph[]) =>
      morphs.filter((m) => m.segmentId !== result.winnerId && m.segmentId !== 'ben')

    // Every morph the swap did not author survives pass 2 byte for byte. If the
    // rolls were re-drawn between passes, an unrelated selector would move.
    expect(unchanged(late)).toEqual(unchanged(result.morphs))
    // And the swap is what pass 2 added.
    expect(late.length).toBeGreaterThan(result.morphs.length)
  })

  it('lands on the same weights in both passes', () => {
    // The invariant, observed end to end: pass 2 must not move an arc, or the
    // winner planSpin drew from a pass-1 wheel would not be the winner the
    // pointer meets.
    const tricks: Trick[] = [
      {
        id: 's',
        name: 'swap',
        recipe: 'swap',
        params: { otherWedgeId: 'ben', at: 0.95 },
        enabled: true,
      },
    ]
    const result = resolveScriptedSpin(base, tricks, spin, [], fixed(0.1))
    if (!result) throw new Error('expected a resolution')

    const weightsOf = (morphs: Morph[]) =>
      landingSegments(result.segments, morphs, spin.motion.durationMs).map((s) => [s.id, s.weight])

    expect(weightsOf(result.resolveLate(result.winnerId))).toEqual(weightsOf(result.morphs))
  })

  it('emits no swap morphs in the first pass', () => {
    const tricks: Trick[] = [
      {
        id: 's',
        name: 'swap',
        recipe: 'swap',
        params: { otherWedgeId: 'ben', at: 0.95 },
        enabled: true,
      },
    ]
    const result = resolveScriptedSpin(base, tricks, spin, [], fixed(0.1))
    expect(result?.morphs).toEqual([])
  })

  it('resolves @randomExternal from the same selector roll in both passes', () => {
    // `swap` ignores the roll entirely, and `relabel` above targets a concrete
    // id, so neither fixture would notice `resolveLate` drawing a fresh
    // selectorRoll instead of reusing the frozen one. A recipe targeting
    // '@randomExternal' does read it, and with more than one candidate on the
    // roster, a fresh draw would be likely to pick a different wedge — which is
    // exactly the winner-naming leak the frozen selectorRoll exists to prevent.
    const roster: Composition = {
      segments: people,
      origins: new Map(
        people.map((segment) => [
          segment.id,
          { kind: 'external', feedId: 'sim', itemId: segment.id } as const,
        ]),
      ),
    }
    const tricks: Trick[] = [
      {
        id: 's',
        name: 'swap',
        recipe: 'swap',
        params: { otherWedgeId: 'ben', at: 0.95 },
        enabled: true,
      },
      {
        id: 'gold',
        name: 'gold',
        recipe: 'recolor',
        params: { targets: ['@randomExternal'], toColor: '#ffd700' },
        enabled: true,
      },
    ]
    // 0.1 wins ana; 0.9 selects cal (floor(0.9 * 3) = 2) — distinct from both
    // the winner and swap's other wedge, so its morph is unambiguous.
    let n = 0
    const twoDraws: Rng = () => [0.1, 0.9][n++] ?? 0.5
    const result = resolveScriptedSpin(roster, tricks, spin, [], twoDraws)
    if (!result) throw new Error('expected a resolution')
    expect(result.winnerId).toBe('ana')

    const late = result.resolveLate(result.winnerId)
    const nonSwap = (morphs: Morph[]) =>
      morphs.filter((m) => m.segmentId !== result.winnerId && m.segmentId !== 'ben')

    expect(nonSwap(result.morphs).map((m) => m.segmentId)).toEqual(['cal'])
    expect(nonSwap(late)).toEqual(nonSwap(result.morphs))
  })
})
