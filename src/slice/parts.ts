import type { ContentTransform, Frame, Orientation, PartContent, SlicePart } from './types'

/** How many parts the editor offers. The data itself is uncapped. */
export const MAX_PARTS = 3

/**
 * Type belongs in the outer half: a band that runs to the hub tapers itself
 * into unreadability, because the chord there goes to zero.
 */
const DEFAULT_BAND: [number, number] = [0.45, 0.94]

export const DEFAULT_PART: SlicePart = {
  content: { from: 'label' },
  orientation: 'stacked',
  band: DEFAULT_BAND,
}

const ORIENTATIONS: Orientation[] = [
  'radial',
  'tangential',
  'curved',
  'stacked',
  'taperedRadial',
  'archedRim',
]

const TRANSFORMS: ContentTransform[] = [
  'full',
  'firstName',
  'lastName',
  'initials',
  'digits',
  'ellipsis',
]

const DERIVED = ['weight', 'index', 'position'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readContent(value: unknown): PartContent | null {
  if (!isRecord(value)) return null
  if (value.from === 'label') {
    const transform = TRANSFORMS.find((entry) => entry === value.transform)
    return transform ? { from: 'label', transform } : { from: 'label' }
  }
  if (value.from === 'text') {
    return typeof value.value === 'string' ? { from: 'text', value: value.value } : null
  }
  if (value.from === 'media') return { from: 'media' }
  if (value.from === 'derived') {
    const derived = DERIVED.find((entry) => entry === value.value)
    return derived ? { from: 'derived', value: derived } : null
  }
  return null
}

const clampUnit = (n: number): number => Math.min(1, Math.max(0, n))

function readBand(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return [...DEFAULT_BAND]
  const [a, b] = value
  if (typeof a !== 'number' || typeof b !== 'number') return [...DEFAULT_BAND]
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [...DEFAULT_BAND]
  return [clampUnit(Math.min(a, b)), clampUnit(Math.max(a, b))]
}

function readStretch(value: unknown): SlicePart['stretch'] | undefined {
  if (value === 'none' || value === 'fill') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function readFrame(value: unknown): Frame | undefined {
  return value === 'level' || value === 'wheel' ? value : undefined
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

function readColor(value: unknown): string | undefined {
  return typeof value === 'string' && HEX.test(value) ? value : undefined
}

/**
 * Leading's floor is above zero on purpose: it divides the band into a size, so
 * a stored 0 would hand every fitted run an infinite one.
 */
export const TRACKING_RANGE: [number, number] = [0, 1]
export const LEADING_RANGE: [number, number] = [0.5, 4]

function readSpacing(value: unknown, [low, high]: [number, number]): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(high, Math.max(low, value))
}

function readPart(value: unknown): SlicePart | null {
  if (!isRecord(value)) return null
  const orientation = ORIENTATIONS.find((entry) => entry === value.orientation)
  if (!orientation) return null
  const content = readContent(value.content)
  if (!content) return null

  const part: SlicePart = { content, orientation, band: readBand(value.band) }
  if (value.direction === 'rimInward' || value.direction === 'hubOutward') {
    part.direction = value.direction
  }
  if (typeof value.fan === 'boolean') part.fan = value.fan
  if (typeof value.caps === 'boolean') part.caps = value.caps
  const stretch = readStretch(value.stretch)
  if (stretch !== undefined) part.stretch = stretch
  if (value.shrink === 'proportional' || value.shrink === 'condense') part.shrink = value.shrink
  if (value.shape === 'glyphs' || value.shape === 'outline') part.shape = value.shape
  if (typeof value.font === 'string' && value.font !== '') part.font = value.font
  if (typeof value.maxSize === 'number' && Number.isFinite(value.maxSize) && value.maxSize > 0) {
    part.maxSize = value.maxSize
  }
  const frame = readFrame(value.frame)
  if (frame) part.frame = frame
  const color = readColor(value.color)
  if (color) part.color = color
  const tracking = readSpacing(value.tracking, TRACKING_RANGE)
  if (tracking !== undefined) part.tracking = tracking
  const leading = readSpacing(value.leading, LEADING_RANGE)
  if (leading !== undefined) part.leading = leading
  return part
}

/** The list as written, with unreadable entries dropped. May be empty. */
export function readPartList(value: unknown): SlicePart[] {
  if (!Array.isArray(value)) return []
  return value.map(readPart).filter((part): part is SlicePart => part !== null)
}

/**
 * An empty list is an authored value and stays empty. A list whose every entry
 * is unreadable is not: a preset from a newer build would otherwise come back
 * as a blank wheel.
 */
export function readParts(value: unknown): SlicePart[] {
  if (!Array.isArray(value)) return [DEFAULT_PART]
  if (value.length === 0) return []
  const parts = readPartList(value)
  return parts.length > 0 ? parts : [DEFAULT_PART]
}
