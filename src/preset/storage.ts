import { MIN_CHURN_INTERVAL_MS } from '../feed/simulated'
import type { FeedConfig, FeedDefaults, ItemOverride } from '../feed/types'
import { getRecipe } from '../tricks/registry'
import { isSelectorToken } from '../tricks/targets'
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'
import { DEFAULT_PRESET } from './defaults'
import type {
  BranchAction,
  BranchNode,
  Condition,
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

function readMotion(value: unknown): Motion {
  const raw = isRecord(value) ? value : {}
  const fallback = DEFAULT_PRESET.spin.motion
  return {
    // Must be positive, not merely finite. Element.animate() throws
    // synchronously on a negative duration, so a hand-edited preset would crash
    // the wheel at spin time — the exact failure this module exists to prevent.
    durationMs: readPositive(raw.durationMs, fallback.durationMs),
    turns: readTurns(raw.turns, fallback.turns),
    direction: raw.direction === 'ccw' ? 'ccw' : 'cw',
    easing: typeof raw.easing === 'string' ? raw.easing : fallback.easing,
  }
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
 * A stored trick that cannot run is disabled, never dropped and never thrown on.
 * The parent spec's rule is that the wheel never breaks the bit, and losing a
 * trick silently would be worse than showing it switched off.
 */
function readTricks(value: unknown, segments: Segment[]): Trick[] {
  if (!Array.isArray(value)) return []
  const tricks: Trick[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (typeof entry.id !== 'string' || typeof entry.recipe !== 'string') continue

    const recipe = getRecipe(entry.recipe)
    const params = isRecord(entry.params) ? entry.params : {}
    const runnable = recipe !== null && recipe.validate(params, segments) === null

    tricks.push({
      id: entry.id,
      name: typeof entry.name === 'string' ? entry.name : entry.id,
      recipe: entry.recipe as Trick['recipe'],
      params,
      enabled: runnable && entry.enabled === true,
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
    if (typeof rawMotion.durationMs === 'number' && rawMotion.durationMs > 0) {
      motion.durationMs = rawMotion.durationMs
    }
    if (typeof rawMotion.turns === 'number' && Number.isFinite(rawMotion.turns)) {
      motion.turns = Math.max(0, rawMotion.turns)
    }
    if (rawMotion.direction === 'cw' || rawMotion.direction === 'ccw') {
      motion.direction = rawMotion.direction
    }
    if (typeof rawMotion.easing === 'string') motion.easing = rawMotion.easing
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
    // Dropped, not disabled as readTricks would: FeedConfig is a union of one,
    // so an unknown kind has nothing to fall back to. A build that ships the
    // Meet adapter bumps the version, and the gate above rejects older data
    // wholesale rather than leaving a kind this parser cannot construct.
    if (entry.kind !== 'simulated' || typeof entry.id !== 'string') continue
    // Live items are keyed by feed id downstream. App builds that record with a
    // computed key, which would store this id as an ordinary entry, so the
    // guard is not rescuing the consumer that exists — it is refusing to make
    // that consumer's construction style load-bearing, and it matches the
    // sibling guard on the same data in feed/bus.ts.
    if (entry.id === PROTO_KEY) continue
    if (feeds.some((feed) => feed.id === entry.id)) continue

    const autochurn = isRecord(entry.autochurn) ? entry.autochurn : {}
    const feed: FeedConfig = {
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
    if (typeof entry.insertAfter === 'string') feed.insertAfter = entry.insertAfter
    feeds.push(feed)
  }
  return feeds
}

/**
 * `media` and `reveal` are deliberately not read, matching readSegments: the
 * wheel renders neither yet, so parsing them would be dead code that has to be
 * kept correct. They stay on ItemOverride so the shape is ready when it ships.
 */
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
    // An override with nothing usable left is indistinguishable from no
    // override, and keeping it would show an empty row in the editor forever.
    if (Object.keys(override).length > 0) overrides[id] = override
  }
  return overrides
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
  if (data.version !== 1 && data.version !== 2 && data.version !== 3) return DEFAULT_PRESET

  const segments = readSegments(data.segments)
  const spin =
    data.version === 1
      ? migrateV1Spin(data.spin)
      : {
          target: readTarget(isRecord(data.spin) ? data.spin.target : undefined),
          motion: readMotion(isRecord(data.spin) ? data.spin.motion : undefined),
        }

  return {
    version: 3,
    name: typeof data.name === 'string' ? data.name : DEFAULT_PRESET.name,
    segments,
    feeds: readFeeds(data.feeds),
    overrides: readOverrides(data.overrides),
    tricks: readTricks(data.tricks, segments),
    spin,
    branches: readBranches(data.branches),
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
