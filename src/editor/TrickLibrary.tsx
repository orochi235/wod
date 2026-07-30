import { EffectCard, EffectCardList, PropertyPanel } from '@weasel-js/labkit'
import type { Conflict } from '../tricks/conflicts'
import { RECIPE_LIST, getRecipe } from '../tricks/registry'
import type { RecipeId, Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'
import { RecipeForm } from './RecipeForm'

export type TrickLibraryProps = {
  tricks: Trick[]
  segments: Segment[]
  conflicts: Conflict[]
  selectedId: string | null
  onChange: (tricks: Trick[]) => void
  onSelect: (trickId: string) => void
}

function newTrickId(tricks: Trick[], recipe: RecipeId): string {
  let n = 1
  while (tricks.some((trick) => trick.id === `${recipe}${n}`)) n += 1
  return `${recipe}${n}`
}

/** Order is the conflict resolution mechanism, so reordering is a real edit. */
export function reorder(
  tricks: Trick[],
  sourceId: string | number,
  targetId: string | number,
  position: 'before' | 'after',
): Trick[] {
  const from = tricks.findIndex((trick) => trick.id === sourceId)
  const moved = tricks[from]
  if (!moved) return tricks
  const without = tricks.filter((_, i) => i !== from)
  const at = without.findIndex((trick) => trick.id === targetId)
  if (at === -1) return tricks
  const insertAt = position === 'before' ? at : at + 1
  return [...without.slice(0, insertAt), moved, ...without.slice(insertAt)]
}

export function TrickLibrary({
  tricks,
  segments,
  conflicts,
  selectedId,
  onChange,
  onSelect,
}: TrickLibraryProps) {
  const replace = (id: string, patch: Partial<Trick>) =>
    onChange(tricks.map((trick) => (trick.id === id ? { ...trick, ...patch } : trick)))

  return (
    <PropertyPanel title="Tricks" className="trick-library">
      <EffectCardList
        items={tricks}
        defaultExpandedIds={selectedId ? [selectedId] : []}
        empty={<p>No tricks yet.</p>}
        onReorder={(sourceId, targetId, position) =>
          onChange(reorder(tricks, sourceId, targetId, position))
        }
        renderItem={(trick, { cardProps }) => {
          const recipe = getRecipe(trick.recipe)
          const own = conflicts.filter((conflict) => conflict.trickIds.includes(trick.id))

          return (
            <EffectCard
              {...cardProps}
              accent={own.length > 0 ? '#e76f51' : undefined}
              onRemove={() => onChange(tricks.filter((other) => other.id !== trick.id))}
              title={
                <button
                  className="trick-card__title"
                  type="button"
                  onClick={() => onSelect(trick.id)}
                >
                  <span className="trick-card__name">{trick.name}</span>
                  <span className="trick-card__recipe">{recipe?.name ?? trick.recipe}</span>
                </button>
              }
              primary={
                <label className="trick-card__enable">
                  <input
                    type="checkbox"
                    aria-label={`Enable ${trick.name}`}
                    checked={trick.enabled}
                    onChange={(event) => replace(trick.id, { enabled: event.target.checked })}
                  />
                </label>
              }
            >
              {own.length > 0 && (
                <output className="trick-card__conflict" aria-label={`${trick.name} conflicts`}>
                  ⚠ also written by another trick: {own.map((c) => c.segmentId).join(', ')}
                </output>
              )}
              {recipe && (
                <>
                  <label className="trick-card__rename">
                    <span>Name</span>
                    <input
                      aria-label={`Rename ${trick.name}`}
                      value={trick.name}
                      onChange={(event) => replace(trick.id, { name: event.target.value })}
                    />
                  </label>
                  <RecipeForm
                    recipe={recipe}
                    params={trick.params}
                    segments={segments}
                    onChange={(params) => replace(trick.id, { params })}
                  />
                </>
              )}
            </EffectCard>
          )
        }}
      />

      <label className="trick-library__add">
        <span>Add a trick</span>
        <select
          value=""
          onChange={(event) => {
            const recipe = getRecipe(event.target.value)
            if (!recipe) return
            const id = newTrickId(tricks, recipe.id)
            onChange([
              ...tricks,
              {
                id,
                name: recipe.name,
                recipe: recipe.id,
                params: { ...recipe.defaults },
                enabled: false,
              },
            ])
            onSelect(id)
          }}
        >
          <option value="">Choose a recipe…</option>
          {RECIPE_LIST.map((recipe) => (
            <option key={recipe.id} value={recipe.id}>
              {recipe.name}
            </option>
          ))}
        </select>
      </label>
    </PropertyPanel>
  )
}
