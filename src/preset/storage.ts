import { inFeedNamespace, wedgeIndexOf } from '../compose/compose'
import type { WedgeIndex } from '../compose/types'
import { MIN_CHURN_INTERVAL_MS } from '../feed/simulated'
import type { FeedConfig, FeedDefaults, ItemOverride } from '../feed/types'
import { DEFAULT_POLL_INTERVAL_MS, MIN_POLL_INTERVAL_MS } from '../meet/poll'
import { readParts } from '../slice/parts'
import { getSlice } from '../slice/registry'
import type { SliceInstance } from '../slice/types'
import { getTransition } from '../transition/registry'
import type { Moment, Transitions } from '../transition/types'
import { getRecipe } from '../tricks/registry'
import { isSelectorToken } from '../tricks/targets'
import type { Trick, TrickParams } from '../tricks/types'
import { DEFAULT_SETTLE_CURVE, isSettleCurve, parseCurve } from '../wheel/curve'
import { getTheme } from '../wheel/themes/registry'
import type { Curve, Media, Reveal, Segment, Settle } from '../wheel/types'
import { DEFAULT_PRESET } from './defaults'
import type {
  BranchAction,
  BranchNode,
  Condition,
  Hub,
  Motion,
  Preset,
  ScriptedSpin,
  SpinModifier,
  Target,
} from './types'

export const PRESET_KEY = 'wod.preset.current'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMedia(value: unknown): Media | undefined {
  if (!isRecord(value)) return undefined
  if (value.kind !== 'emoji' && value.kind !== 'image' && value.kind !== 'gif') return undefined
  if (typeof value.value !== 'string') return undefined
  return { kind: value.kind, value: value.value }
}

/**
 * An empty object survives: a reveal with nothing authored is an overlay showing
 * the segment's label, which is distinct from having no reveal at all.
 */
function readReveal(value: unknown): Reveal | undefined {
  if (!isRecord(value)) return undefined
  const reveal: Reveal = {}
  if (typeof value.headline === 'string') reveal.headline = value.headline
  if (typeof value.body === 'string') reveal.body = value.body
  const media = readMedia(value.media)
  if (media !== undefined) reveal.media = media
  if (typeof value.sound === 'string') reveal.sound = value.sound
  if (value.effect !== undefined) reveal.effect = value.effect === 'confetti' ? 'confetti' : 'none'
  if (typeof value.holdMs === 'number' && Number.isFinite(value.holdMs) && value.holdMs > 0) {
    reveal.holdMs = value.holdMs
  }
  return reveal
}

function readSlice(value: unknown): SliceInstance | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined
  const layout = getSlice(value.id)
  if (!layout) return undefined
  const params = isRecord(value.params) ? value.params : {}
  // Only the composed layout carries parts. Every other layout's params are
  // read by the layout itself, through fallbacks that cannot throw.
  if (layout.id === 'composed') {
    return { id: layout.id, params: { ...params, parts: readParts(params.parts) } }
  }
  return { id: layout.id, params }
}

function readSegments(value: unknown): Segment[] {
  if (!Array.isArray(value)) return []
  const segments: Segment[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (typeof entry.id !== 'string' || typeof entry.label !== 'string') continue
    // Id generation never emits '@', but imported JSON is hand-editable. A wedge
    // claiming a selector's id would be permanently unaddressable — every trick
    // naming it would expand to the token's whole set instead.
    if (isSelectorToken(entry.id)) continue
    const weight =
      typeof entry.weight === 'number' && Number.isFinite(entry.weight)
        ? Math.max(0, entry.weight)
        : 0
    // Ids have to be unique: the wheel keys its arcs by segment id, and lookups
    // in spin and selection resolve to whichever duplicate comes first, so a
    // repeated id makes the pointer and the announced winner disagree.
    if (segments.some((existing) => existing.id === entry.id)) continue

    const segment: Segment = { id: entry.id, label: entry.label, weight }
    if (typeof entry.color === 'string') segment.color = entry.color
    const media = readMedia(entry.media)
    if (media !== undefined) segment.media = media
    const reveal = readReveal(entry.reveal)
    if (reveal !== undefined) segment.reveal = reveal
    const slice = readSlice(entry.slice)
    if (slice !== undefined) segment.slice = slice
    if (typeof entry.look === 'string' && entry.look !== '') segment.look = entry.look
    segments.push(segment)
  }
  return segments
}

/** Positive and finite, or the fallback. */
function readPositive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function readTarget(value: unknown): Target {
  if (!isRecord(value)) return { kind: 'fair' }
  if (value.kind === 'forced' && typeof value.segmentId === 'string') {
    return { kind: 'forced', segmentId: value.segmentId }
  }
  return { kind: 'fair' }
}

/** Non-negative and finite, or the fallback. Zero turns is a legitimate spin. */
function readTurns(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

/**
 * A curve with no positive finite slope has no handover speed to match, and
 * the solve would divide by it. Falling back beats spinning to infinity.
 */
function readSettleCurve(value: unknown): Curve {
  const curve = parseCurve(value)
  return curve && isSettleCurve(curve) ? curve : DEFAULT_SETTLE_CURVE
}

/**
 * Clamped to half the duration. Zero is legal and means "stop dead from full
 * speed", which is a different animation from the field being absent —
 * absent runs the old single-curve rotation.
 */
function readSettle(value: unknown, durationMs: number): Settle | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.ms !== 'number' || !Number.isFinite(value.ms)) return undefined
  return {
    ms: Math.min(Math.max(0, value.ms), durationMs / 2),
    curve: readSettleCurve(value.curve),
  }
}

function readCurve(value: unknown, fallback: Curve): Curve {
  return parseCurve(value) ?? fallback
}

function readMotion(value: unknown): Motion {
  const raw = isRecord(value) ? value : {}
  const fallback = DEFAULT_PRESET.spin.motion
  // Must be positive, not merely finite. Element.animate() throws
  // synchronously on a negative duration, so a hand-edited preset would crash
  // the wheel at spin time — the exact failure this module exists to prevent.
  const durationMs = readPositive(raw.durationMs, fallback.durationMs)
  const motion: Motion = {
    durationMs,
    turns: readTurns(raw.turns, fallback.turns),
    direction: raw.direction === 'ccw' ? 'ccw' : 'cw',
    easing: readCurve(raw.easing, fallback.easing),
  }
  const settle = readSettle(raw.settle, durationMs)
  if (settle) motion.settle = settle
  return motion
}

/** The v1 shape: a flat spin block with `fullSpins`, no target, no branches. */
function migrateV1Spin(value: unknown): ScriptedSpin {
  const raw = isRecord(value) ? value : {}
  return {
    target: { kind: 'fair' },
    motion: readMotion({
      durationMs: raw.durationMs,
      turns: raw.fullSpins,
      direction: 'cw',
      easing: raw.easing,
    }),
  }
}

/**
 * Which ids a trick may name here, which is not the same set the editor sees.
 *
 * Statics are on the wheel already. A roster wedge is not and cannot be — items
 * arrive on the bus long after this runs — so the most this can ask is whether
 * some configured feed owns that namespace. A wedge another trick contributes
 * is knowable, since the tricks are right here in the same data.
 *
 * Deliberately not "anything unrecognized is fine". That would also swallow the
 * warning this validation exists for: an id like `seg2` that named a segment
 * somebody has since deleted is stale, and the trick should come back switched
 * off rather than silently aiming at nothing.
 */
function knownWedges(statics: Segment[], feeds: FeedConfig[], provided: Set<string>): WedgeIndex {
  const onTheWheel = wedgeIndexOf(statics)
  return { has: (id) => onTheWheel.has(id) || provided.has(id) || inFeedNamespace(feeds, id) }
}

/**
 * A stored trick that cannot run is disabled, never dropped and never thrown on.
 * The parent spec's rule is that the wheel never breaks the bit, and losing a
 * trick silently would be worse than showing it switched off.
 *
 * Two passes, because a trick may aim at a wedge a later trick contributes and
 * the order tricks were written in is the operator's business, not a validity
 * rule. Pass 1 asks every recipe what it provides; pass 2 validates against the
 * union of that and the wheel.
 */
function readTricks(value: unknown, statics: Segment[], feeds: FeedConfig[]): Trick[] {
  if (!Array.isArray(value)) return []

  type Entry = { id: string; name: string; recipe: string; params: TrickParams; asked: boolean }
  const entries: Entry[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (typeof entry.id !== 'string' || typeof entry.recipe !== 'string') continue
    entries.push({
      id: entry.id,
      name: typeof entry.name === 'string' ? entry.name : entry.id,
      recipe: entry.recipe,
      params: isRecord(entry.params) ? entry.params : {},
      // What the file asked for, which only becomes `enabled` if it validates.
      asked: entry.enabled === true,
    })
  }

  const provided = new Set<string>()
  for (const entry of entries) {
    const recipe = getRecipe(entry.recipe)
    if (!recipe) continue
    // Safe on unvalidated params: every recipe reads them through the readers
    // in params.ts, which fall back rather than throw.
    for (const segment of recipe.provides(entry.params, entry.id)) provided.add(segment.id)
  }

  const wedges = knownWedges(statics, feeds, provided)
  const tricks: Trick[] = []
  for (const entry of entries) {
    const recipe = getRecipe(entry.recipe)
    const runnable = recipe !== null && recipe.validate(entry.params, wedges) === null
    tricks.push({
      id: entry.id,
      name: entry.name,
      recipe: entry.recipe as Trick['recipe'],
      params: entry.params,
      enabled: runnable && entry.asked,
    })
  }
  return tricks
}

function readCondition(value: unknown): Condition | null {
  if (!isRecord(value) || value.kind !== 'landsOn') return null
  if (!Array.isArray(value.segmentIds)) return null
  const ids = value.segmentIds.filter((id): id is string => typeof id === 'string')
  // An empty list can never match, which makes it indistinguishable from having
  // no usable condition at all. Dropping it here keeps that rule in one place.
  if (ids.length === 0) return null
  return { kind: 'landsOn', segmentIds: ids }
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((id): id is string => typeof id === 'string')
}

function readModifier(value: unknown): SpinModifier {
  const raw = isRecord(value) ? value : {}
  const modifier: SpinModifier = {}
  if (isRecord(raw.target)) modifier.target = readTarget(raw.target)
  // Bound to a local so TypeScript keeps the narrowing across every read below.
  const rawMotion = isRecord(raw.motion) ? raw.motion : null
  if (rawMotion) {
    // Partial by design: a modifier may set only direction, only easing, and so
    // on. readMotion would fill the gaps with defaults and silently overwrite
    // whatever the spin already had.
    const motion: Partial<Motion> = {}
    if (
      typeof rawMotion.durationMs === 'number' &&
      Number.isFinite(rawMotion.durationMs) &&
      rawMotion.durationMs > 0
    ) {
      motion.durationMs = rawMotion.durationMs
    }
    if (typeof rawMotion.turns === 'number' && Number.isFinite(rawMotion.turns)) {
      motion.turns = Math.max(0, rawMotion.turns)
    }
    if (rawMotion.direction === 'cw' || rawMotion.direction === 'ccw') {
      motion.direction = rawMotion.direction
    }
    const easing = parseCurve(rawMotion.easing)
    if (easing) motion.easing = easing
    // Unclamped, unlike readMotion: a modifier need not carry the duration to
    // clamp against, and `rotationTrack` clamps at spin time regardless.
    if (isRecord(rawMotion.settle)) {
      const ms = rawMotion.settle.ms
      if (typeof ms === 'number' && Number.isFinite(ms)) {
        motion.settle = { ms: Math.max(0, ms), curve: readSettleCurve(rawMotion.settle.curve) }
      }
    }
    if (Object.keys(motion).length > 0) modifier.motion = motion
  }
  const enable = readStringArray(raw.enableTricks)
  const disable = readStringArray(raw.disableTricks)
  if (enable) modifier.enableTricks = enable
  if (disable) modifier.disableTricks = disable
  return modifier
}

function readAction(value: unknown): BranchAction | undefined {
  if (!isRecord(value)) return undefined
  if (value.kind === 'replace') {
    const spin = isRecord(value.spin) ? value.spin : {}
    return {
      kind: 'replace',
      spin: { target: readTarget(spin.target), motion: readMotion(spin.motion) },
    }
  }
  if (value.kind === 'modify') return { kind: 'modify', modifier: readModifier(value.modifier) }
  return undefined
}

/**
 * Deeper than the resolver will ever walk, and deeper than any authored tree.
 * The cap exists because `readBranches` recurses per level and presets arrive
 * by import: without it a few thousand nested `then` levels overflow the stack
 * and throw out of `parsePreset`, which is the one thing this module must
 * never do.
 */
const MAX_BRANCH_DEPTH = 64

/**
 * A node without a usable condition is dropped: it could never match, and
 * keeping it would put a rule in the editor that silently does nothing. An
 * unusable *action* only loses the action — the node may still route via `then`.
 */
function readBranches(value: unknown, depth = 0): BranchNode[] {
  if (!Array.isArray(value) || depth >= MAX_BRANCH_DEPTH) return []
  const nodes: BranchNode[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    const when = readCondition(entry.when)
    if (!when) continue

    const node: BranchNode = { id: entry.id, when }
    const action = readAction(entry.do)
    if (action) node.do = action
    if (Array.isArray(entry.then)) {
      const children = readBranches(entry.then, depth + 1)
      // biome-ignore lint/suspicious/noThenProperty: `then` is BranchNode's routing field, not a thenable.
      if (children.length > 0) node.then = children
    }
    nodes.push(node)
  }
  return nodes
}

/**
 * `__proto__` is a hazard on the write side, and only for some writes:
 * `record[key] = value` invokes the prototype setter, so the entry is never
 * stored and the record's prototype is replaced instead, while a computed key
 * in an object literal defines an ordinary own property. JSON.parse likewise
 * hands back an own `__proto__` key, so a hand-edited preset arrives here
 * carrying one. Readers already guard their lookups (getRecipe, composeBase);
 * dropping the key at the parse boundary is what means no record built from
 * this data has to be constructed one particular way to stay safe.
 */
const PROTO_KEY = '__proto__'

function readFeedDefaults(value: unknown): FeedDefaults {
  const raw = isRecord(value) ? value : {}
  const defaults: FeedDefaults = {
    weight:
      typeof raw.weight === 'number' && Number.isFinite(raw.weight) ? Math.max(0, raw.weight) : 1,
  }
  if (typeof raw.color === 'string') defaults.color = raw.color
  return defaults
}

/** Clamped to 0..1. A volatility outside that range is not a slower simulation, it is a broken one. */
function readUnitValue(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

/**
 * A headcount: non-negative, finite, and whole. Rounded rather than merely
 * clamped, because the simulator compares a roster length against this — a
 * fractional target sits permanently between two lengths, so churn adds and
 * removes on every tick and `volatility` stops governing anything.
 */
function readCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(0, value))
    : fallback
}

/**
 * A feed id has to be unique: composeBase namespaces wedge ids by it, so two
 * feeds sharing one would collide item for item and silently lose a roster.
 *
 * An `insertAfter` naming no known segment is kept, not dropped: composeBase
 * degrades to appending, and the segment it anchors to may be authored later.
 */
function readFeeds(value: unknown): FeedConfig[] {
  if (!Array.isArray(value)) return []
  const feeds: FeedConfig[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    // Live items are keyed by feed id downstream. App builds that record with a
    // computed key, which would store this id as an ordinary entry, so the
    // guard is not rescuing the consumer that exists — it is refusing to make
    // that consumer's construction style load-bearing, and it matches the
    // sibling guard on the same data in feed/bus.ts.
    if (typeof entry.id !== 'string') continue
    if (entry.id === PROTO_KEY) continue
    if (feeds.some((feed) => feed.id === entry.id)) continue

    let feed: FeedConfig
    if (entry.kind === 'simulated') {
      const autochurn = isRecord(entry.autochurn) ? entry.autochurn : {}
      feed = {
        kind: 'simulated',
        id: entry.id,
        defaults: readFeedDefaults(entry.defaults),
        pool: Array.isArray(entry.pool)
          ? entry.pool.filter((name): name is string => typeof name === 'string')
          : [],
        autochurn: {
          intervalMs: Math.max(MIN_CHURN_INTERVAL_MS, readPositive(autochurn.intervalMs, 2000)),
          targetSize: readCount(autochurn.targetSize, 6),
          volatility: readUnitValue(autochurn.volatility, 0.3),
        },
      }
    } else if (entry.kind === 'meet') {
      feed = {
        kind: 'meet',
        id: entry.id,
        defaults: readFeedDefaults(entry.defaults),
        conference: typeof entry.conference === 'string' ? entry.conference : '',
        intervalMs: Math.max(
          MIN_POLL_INTERVAL_MS,
          readPositive(entry.intervalMs, DEFAULT_POLL_INTERVAL_MS),
        ),
      }
    } else {
      // Dropped rather than disabled as readTricks would: an unknown kind has
      // no shape this parser can construct. A build that adds one bumps the
      // version, and the gate in parsePreset rejects newer data wholesale.
      continue
    }

    if (typeof entry.insertAfter === 'string') feed.insertAfter = entry.insertAfter
    feeds.push(feed)
  }
  return feeds
}

function readOverrides(value: unknown): Record<string, ItemOverride> {
  if (!isRecord(value)) return {}
  const overrides: Record<string, ItemOverride> = {}
  for (const [id, raw] of Object.entries(value)) {
    if (id === PROTO_KEY) continue
    if (!isRecord(raw)) continue
    const override: ItemOverride = {}
    if (raw.excluded === true) override.excluded = true
    if (typeof raw.label === 'string') override.label = raw.label
    if (typeof raw.weight === 'number' && Number.isFinite(raw.weight)) {
      override.weight = Math.max(0, raw.weight)
    }
    if (typeof raw.color === 'string') override.color = raw.color
    const media = readMedia(raw.media)
    if (media !== undefined) override.media = media
    const reveal = readReveal(raw.reveal)
    if (reveal !== undefined) override.reveal = reveal
    const slice = readSlice(raw.slice)
    if (slice !== undefined) override.slice = slice
    // An override with nothing usable left is indistinguishable from no
    // override, and keeping it would show an empty row in the editor forever.
    if (Object.keys(override).length > 0) overrides[id] = override
  }
  return overrides
}

const MOMENTS: Moment[] = ['enter', 'exit', 'spin', 'reveal']

function readTransitions(value: unknown): Transitions | undefined {
  if (!isRecord(value)) return undefined

  const transitions: Transitions = {}
  for (const moment of MOMENTS) {
    const entry = value[moment]
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    const transition = getTransition(entry.id)
    if (!transition) continue
    transitions[moment] = {
      id: transition.id,
      params: isRecord(entry.params) ? entry.params : {},
    }
  }

  // Absent rather than empty: an empty object and no object mean the same
  // thing, and only one of them survives a round trip unchanged.
  return Object.keys(transitions).length === 0 ? undefined : transitions
}

function readTheme(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  // Resolved rather than trusted: the id indexes a record, and a stored
  // 'constructor' would otherwise come back as a function.
  return getTheme(value)?.id
}

/**
 * Absent rather than empty, as `readTransitions` is: a hub with neither an
 * emblem nor a flag is the bare cap, which is what no hub at all already means.
 */
function readHub(value: unknown): Hub | undefined {
  if (!isRecord(value)) return undefined
  const hub: Hub = {}
  const emblem = readMedia(value.emblem)
  if (emblem !== undefined) hub.emblem = emblem
  if (typeof value.spins === 'boolean') hub.spins = value.spins
  return Object.keys(hub).length === 0 ? undefined : hub
}

export function parsePreset(raw: string | null): Preset {
  if (raw === null) return DEFAULT_PRESET

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return DEFAULT_PRESET
  }

  if (!isRecord(data)) return DEFAULT_PRESET
  if (
    data.version !== 1 &&
    data.version !== 2 &&
    data.version !== 3 &&
    data.version !== 4 &&
    data.version !== 5
  ) {
    return DEFAULT_PRESET
  }

  const segments = readSegments(data.segments)
  const spin =
    data.version === 1
      ? migrateV1Spin(data.spin)
      : {
          target: readTarget(isRecord(data.spin) ? data.spin.target : undefined),
          motion: readMotion(isRecord(data.spin) ? data.spin.motion : undefined),
        }

  // Read before the tricks, which validate against the namespaces it defines.
  const feeds = readFeeds(data.feeds)

  return {
    version: 5,
    name: typeof data.name === 'string' ? data.name : DEFAULT_PRESET.name,
    segments,
    feeds,
    overrides: readOverrides(data.overrides),
    tricks: readTricks(data.tricks, segments, feeds),
    spin,
    branches: readBranches(data.branches),
    transitions: readTransitions(data.transitions),
    slice: readSlice(data.slice),
    theme: readTheme(data.theme),
    hub: readHub(data.hub),
  }
}

export function loadPreset(): Preset {
  try {
    return parsePreset(window.localStorage.getItem(PRESET_KEY))
  } catch {
    return DEFAULT_PRESET
  }
}

export function savePreset(preset: Preset): void {
  try {
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(preset))
  } catch {
    // Quota or a private-mode restriction. Editing keeps working in memory.
  }
}

/** Fires when another window writes the preset, so an open show page follows along. */
export function subscribePreset(onChange: (preset: Preset) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PRESET_KEY) return
    onChange(parsePreset(event.newValue))
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
