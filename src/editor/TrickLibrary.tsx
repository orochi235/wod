import { PropertyPanel } from '@weasel-js/labkit'
import { type EffectKind, EffectList, type EffectListItem } from '@weasel-js/ui'
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
  onSelect: (trickId: string | null) => void
}

function newTrickId(tricks: Trick[], recipe: RecipeId): string {
  let n = 1
  while (tricks.some((trick) => trick.id === `${recipe}${n}`)) n += 1
  return `${recipe}${n}`
}

type TrickCard = EffectListItem

/** A conflicted trick's card wears this kind's color in place of its recipe's. */
const CONFLICTED = ':conflicted'
const CONFLICT_COLOR = { space: 'srgb', coords: [0xe7 / 255, 0x6f / 255, 0x51 / 255] }

const KINDS: Record<string, EffectKind> = Object.fromEntries(
  RECIPE_LIST.flatMap((recipe, index) => [
    [recipe.id, { label: recipe.name, color: index }],
    [recipe.id + CONFLICTED, { label: recipe.name, color: CONFLICT_COLOR }],
  ]),
)

/**
 * The tricks in the cards' order, with each card's name and switch. Order is
 * the conflict resolution mechanism, so reordering is a real edit.
 */
export function applyCards(tricks: Trick[], cards: readonly TrickCard[]): Trick[] {
  const byId = new Map(tricks.map((trick) => [trick.id, trick]))
  return cards.flatMap((card) => {
    const trick = byId.get(card.id)
    if (!trick) return []
    return trick.name === card.name && trick.enabled === card.on
      ? [trick]
      : [{ ...trick, name: card.name, enabled: card.on }]
  })
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
      {tricks.length === 0 ? (
        <p>No tricks yet.</p>
      ) : (
        <EffectList<TrickCard>
          aria-label="Tricks"
          items={tricks.map((trick) => ({
            id: trick.id,
            kind: conflictsOf(trick.id).length > 0 ? trick.recipe + CONFLICTED : trick.recipe,
            name: trick.name,
            on: trick.enabled,
          }))}
          kinds={KINDS}
          onChange={(cards) => onChange(applyCards(tricks, cards))}
          selected={selectedId}
          onSelectionChange={onSelect}
          renderBody={(card) => {
            const trick = tricks.find((entry) => entry.id === card.id)
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
                  <RecipeForm
                    fields={recipe.fields}
                    params={trick.params}
                    segments={segments}
                    onChange={(params) => replace(trick.id, { params })}
                  />
                )}
              </>
            )
          }}
        />
      )}

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
