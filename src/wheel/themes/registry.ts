import type { Theme } from '../theme'
import { board } from './board'
import { flat } from './flat'
import { poster } from './poster'
import { wof } from './wof'

export type ThemeId = 'flat' | 'wof' | 'board' | 'poster'

export const THEMES: Record<ThemeId, Theme> = { flat, wof, board, poster }

export const THEME_LIST: Theme[] = [flat, wof, board, poster]

/**
 * Returns null rather than throwing, matching getTransition: ids come out of
 * localStorage, and a stored id of 'constructor' resolves through the prototype
 * chain to something that is not a theme.
 */
export function getTheme(id: string): Theme | null {
  return Object.hasOwn(THEMES, id) ? THEMES[id as ThemeId] : null
}
