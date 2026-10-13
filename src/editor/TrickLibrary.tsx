import { LayerList, type LayerMove, PropertyPanel } from '@weasel-js/labkit'
import { type Conflict, conflictText } from '../tricks/conflicts'
import { getRecipe, RECIPE_LIST } from '../tricks/registry'
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
export function reorder(tricks: Trick[], move: LayerMove): Trick[] {
  const moving = new Set(move.ids)
  const moved = tricks.filter((trick) => moving.has(trick.id))
  if (moved.length === 0) return tricks
  const rest = tricks.filter((trick) => !moving.has(trick.id))
  return [...rest.slice(0, move.index), ...moved, ...rest.slice(move.index)]
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
  const conflictsOf = (id: string) => conflicts.filter((conflict) => conflict.trickIds.includes(id))

  return (
    <PropertyPanel title="Tricks" className="trick-library">
      <LayerList
        // LayerList stops reading defaultCollapsed once a card is folded by hand,
        // so a selection made elsewhere (a ghost row in the segment list) would
        // not open its form. Keying on the selection remounts the list.
        key={selectedId ?? 'none'}
        label="Tricks"
        items={tricks.map((trick) => {
          const recipe = getRecipe(trick.recipe)
          return {
            id: trick.id,
            label: trick.name,
            // A card draws no `leading`; that slot holds its drag handle.
            title: (
              <span className="trick-card__title">
                <label className="trick-card__enable">
                  <input
                    type="checkbox"
                    aria-label={`Enable ${trick.name}`}
                    checked={trick.enabled}
                    onChange={(event) => replace(trick.id, { enabled: event.target.checked })}
                  />
                </label>
                <span className="trick-card__name">{trick.name}</span>
                <span className="trick-card__recipe">{recipe?.name ?? trick.recipe}</span>
              </span>
            ),
            tone: conflictsOf(trick.id).length > 0 ? '#e76f51' : undefined,
            defaultCollapsed: trick.id !== selectedId,
          }
        })}
        selectedIds={selectedId ? [selectedId] : []}
        onSelect={(ids) => {
          if (ids[0]) onSelect(ids[0])
        }}
        empty={<p>No tricks yet.</p>}
        onReorder={(move) => onChange(reorder(tricks, move))}
        onRemove={(id) => onChange(tricks.filter((other) => other.id !== id))}
        renderBody={(item) => {
          const trick = tricks.find((entry) => entry.id === item.id)
          if (!trick) return null
          const recipe = getRecipe(trick.recipe)
          const own = conflictsOf(trick.id)
          return (
            <>
              {own.length > 0 && (
                <output className="trick-card__conflict" aria-label={`${trick.name} conflicts`}>
                  ⚠ {conflictText(trick.id, own)}
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
                    fields={recipe.fields}
                    params={trick.params}
                    segments={segments}
                    onChange={(params) => replace(trick.id, { params })}
                  />
                </>
              )}
            </>
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
                // Deep, not a spread. Several recipes declare array params such
                // as `targets: []`, and a shallow copy hands every trick of that
                // recipe the same array instance as each other and as the
                // module-level default. Nothing mutates in place today, but one
                // `params.targets.push(...)` anywhere would corrupt every trick
                // built from that recipe, past and future.
                params: structuredClone(recipe.defaults),
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
