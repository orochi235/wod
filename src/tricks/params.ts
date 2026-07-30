import { EASINGS } from '../wheel/morph'
import type { EasingName } from '../wheel/types'
import type { TrickParams } from './types'

export function readNumber(params: TrickParams, key: string, fallback: number): number {
  const value = params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function readString(params: TrickParams, key: string, fallback: string): string {
  const value = params[key]
  return typeof value === 'string' ? value : fallback
}

export function readOptionalString(params: TrickParams, key: string): string | undefined {
  const value = params[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

export function readStringArray(params: TrickParams, key: string): string[] {
  const value = params[key]
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/**
 * Validated against `EASINGS` rather than a parallel list of names. That record
 * is typed `Record<EasingName, ...>`, so adding an easing to the union forces it
 * to be added there too — a second list here could silently fall out of sync and
 * reject a legitimate easing.
 *
 * `Object.hasOwn`, not `in`: `in` walks the prototype chain and would accept
 * 'toString' as an easing.
 */
export function readEasing(params: TrickParams, key: string): EasingName {
  const value = params[key]
  return typeof value === 'string' && Object.hasOwn(EASINGS, value)
    ? (value as EasingName)
    : 'linear'
}

/** Clamps to 0..1, which every timing parameter needs. */
export function readUnit(params: TrickParams, key: string, fallback: number): number {
  return Math.min(1, Math.max(0, readNumber(params, key, fallback)))
}
