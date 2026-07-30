import type { EasingName } from '../wheel/types'
import type { TrickParams } from './types'

const EASING_NAMES: EasingName[] = ['linear', 'easeIn', 'easeOut', 'easeInOut']

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

export function readEasing(params: TrickParams, key: string): EasingName {
  const value = params[key]
  return EASING_NAMES.find((name) => name === value) ?? 'linear'
}

/** Clamps to 0..1, which every timing parameter needs. */
export function readUnit(params: TrickParams, key: string, fallback: number): number {
  return Math.min(1, Math.max(0, readNumber(params, key, fallback)))
}
