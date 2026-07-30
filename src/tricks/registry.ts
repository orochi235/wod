import { recolor } from './recipes/recolor'
import { relabel } from './recipes/relabel'
import { takeover } from './recipes/takeover'
import { vanish } from './recipes/vanish'
import type { Recipe, RecipeId } from './types'

export const RECIPES: Record<RecipeId, Recipe> = {
  takeover,
  vanish,
  recolor,
  relabel,
}

export const RECIPE_LIST: Recipe[] = [takeover, vanish, recolor, relabel]

/**
 * Returns null rather than throwing, so stored data can never crash a load.
 *
 * `Object.hasOwn`, not a bare lookup with `?? null`: recipe ids come out of
 * localStorage, and a stored id of 'constructor', 'toString', or '__proto__'
 * resolves through the prototype chain to something that is not undefined, so
 * the nullish coalesce never fires. Callers would then treat `Object` as a
 * recipe and blow up on the first `provides()` call.
 */
export function getRecipe(id: string): Recipe | null {
  return Object.hasOwn(RECIPES, id) ? RECIPES[id as RecipeId] : null
}
