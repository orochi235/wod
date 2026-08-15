import { fade } from './transitions/fade'
import { fly } from './transitions/fly'
import { shrink } from './transitions/shrink'
import type { Transition, TransitionId } from './types'

export const TRANSITIONS: Record<TransitionId, Transition> = { fade, fly, shrink }

export const TRANSITION_LIST: Transition[] = [fade, fly, shrink]

/**
 * Returns null rather than throwing, matching getRecipe: ids come out of
 * localStorage, and a stored id of 'constructor' or '__proto__' resolves
 * through the prototype chain to something that is not a transition.
 */
export function getTransition(id: string): Transition | null {
  return Object.hasOwn(TRANSITIONS, id) ? TRANSITIONS[id as TransitionId] : null
}
