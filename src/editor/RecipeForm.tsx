import {
  CheckboxRow,
  ColorRow,
  NumberRow,
  PropertyList,
  PropertyRow,
  SelectRow,
  SliderRow,
  TextRow,
} from '@weasel-js/labkit'
import { SELECTOR_TOKENS, type SelectorToken } from '../tricks/targets'
import type { Recipe, RecipeField, TrickParams } from '../tricks/types'
import type { Segment } from '../wheel/types'

/**
 * Operator-facing wording. The tokens themselves are internal.
 *
 * The roster labels say "wedge", not "everyone in the meeting": `composeBase`
 * skips excluded items and lets a static wedge claim a feed id first, so a
 * selector reaches the wedges a feed produced, not every attendee. Promising
 * the latter would surprise anyone who had just excluded someone.
 */
const SELECTOR_LABELS: Record<SelectorToken, string> = {
  '@all': 'Everything on the wheel',
  '@static': 'All authored wedges',
  '@external': 'All roster wedges',
  '@computed': 'All trick wedges',
  '@randomExternal': 'One random roster wedge',
}

export type RecipeFormProps = {
  recipe: Recipe
  params: TrickParams
  segments: Segment[]
  onChange: (params: TrickParams) => void
}

export function RecipeForm({ recipe, params, segments, onChange }: RecipeFormProps) {
  const set = (key: string, value: unknown) => onChange({ ...params, [key]: value })

  const row = (field: RecipeField) => {
    const value = params[field.key]

    switch (field.kind) {
      case 'slider':
        return (
          <SliderRow
            key={field.key}
            label={field.label}
            min={field.min}
            max={field.max}
            step={field.step}
            value={typeof value === 'number' ? value : field.min}
            onChange={(next) => set(field.key, next)}
          />
        )
      case 'number':
        return (
          <NumberRow
            key={field.key}
            label={field.label}
            min={field.min}
            max={field.max}
            value={typeof value === 'number' ? value : 0}
            onChange={(next) => set(field.key, next)}
          />
        )
      case 'color':
        return (
          <ColorRow
            key={field.key}
            label={field.label}
            value={typeof value === 'string' && value !== '' ? value : '#888888'}
            onChange={(next) => set(field.key, next)}
          />
        )
      case 'text':
        return (
          <TextRow
            key={field.key}
            label={field.label}
            value={typeof value === 'string' ? value : ''}
            onChange={(next) => set(field.key, next)}
          />
        )
      case 'toggle':
        return (
          <CheckboxRow
            key={field.key}
            label={field.label}
            value={value === true}
            onChange={(next) => set(field.key, next)}
          />
        )
      case 'select':
        return (
          <SelectRow
            key={field.key}
            label={field.label}
            options={field.options}
            value={typeof value === 'string' ? value : (field.options[0]?.value ?? '')}
            onChange={(next) => set(field.key, next)}
          />
        )
      case 'segments':
        // No labkit multi-select exists. PropertyRow still provides the label
        // association and the panel's row styling.
        return (
          <PropertyRow key={field.key} label={field.label}>
            <select
              multiple
              value={Array.isArray(value) ? (value as string[]) : []}
              onChange={(event) =>
                set(
                  field.key,
                  [...event.target.selectedOptions].map((option) => option.value),
                )
              }
            >
              {/* Grouped so a wedge someone labeled "Everything" cannot be
                  mistaken for the selector of nearly the same name. */}
              <optgroup label="Selectors">
                {SELECTOR_TOKENS.map((token) => (
                  <option key={token} value={token}>
                    {SELECTOR_LABELS[token]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Wedges">
                {segments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </PropertyRow>
        )
    }
  }

  return <PropertyList pack="pairs">{recipe.fields.map(row)}</PropertyList>
}
