import { assert, describe, expect, it, vi } from 'vitest'
import { composeBase } from '../compose/compose'
import type { BranchAction, BranchNode, ScriptedSpin } from '../preset/types'
import { RECIPES } from '../tricks/registry'
import type { Trick } from '../tricks/types'
import type { Rng } from '../wheel/selection'
import type { Segment } from '../wheel/types'
import { MAX_DEPTH, resolveScriptedSpin } from './resolve'

const people: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
  { id: 'cal', label: 'Cal', weight: 1 },
]

const base = composeBase({ statics: people, feeds: [], items: {}, overrides: {} })

const spin: ScriptedSpin = {
  target: { kind: 'fair' },
  motion: { durationMs: 4000, turns: 5, direction: 'cw', easing: 'linear' },
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
            motion: { durationMs: 1000, turns: 2, direction: 'ccw', easing: 'ease-out' },
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
    expect(result?.motion.easing).toBe('linear')
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

  it('uses one frozen roll for the whole walk', () => {
    // A counting rng proves the resolver draws exactly once no matter how many
    // times it re-evaluates. Re-rolling would move the winner for reasons the
    // operator did not author.
    let calls = 0
    const counting: Rng = () => {
      calls++
      return 0.1
    }
    const branches: BranchNode[] = [
      {
        id: 'a',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { motion: { turns: 9 } } },
        // biome-ignore lint/suspicious/noThenProperty: `then` is BranchNode's routing field, not a thenable.
        then: [{ id: 'b', when: { kind: 'landsOn', segmentIds: ['ana'] } }],
      },
    ]
    resolveScriptedSpin(base, [], spin, branches, counting)
    expect(calls).toBe(1)
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
    expect(drifted).toEqual(resolveScriptedSpin(base, [], spin, branches, fixed(0.42)))
    // Vacuous if the branch never fired, which would mean only one evaluation ran.
    expect(drifted?.motion.turns).toBe(9)
    expect(drifted?.winnerId).toBe('ben')
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
})
