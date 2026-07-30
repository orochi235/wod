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

/** Returns null rather than throwing, so stored data can never crash a load. */
export function getRecipe(id: string): Recipe | null {
  return RECIPES[id as RecipeId] ?? null
}
