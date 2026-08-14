import { PropertyPanel, SelectRow } from '@weasel-js/labkit'
import { TRANSITION_LIST, getTransition } from '../transition/registry'
import type { TransitionParams, Transitions } from '../transition/types'
import { RecipeForm } from './RecipeForm'

export type TransitionPanelProps = {
  transitions: Transitions | undefined
  onChange: (transitions: Transitions | undefined) => void
}

const NONE = ''

export function TransitionPanel({ transitions, onChange }: TransitionPanelProps) {
  const enter = transitions?.enter
  const transition = enter ? getTransition(enter.id) : null

  const arm = (value: string) => {
    if (value === NONE) {
      onChange(undefined)
      return
    }
    const chosen = getTransition(value)
    if (!chosen) return
    onChange({ enter: { id: chosen.id, params: { ...chosen.defaults } } })
  }

  const edit = (params: TransitionParams) => {
    if (!enter) return
    onChange({ enter: { ...enter, params } })
  }

  return (
    <PropertyPanel title="Transitions">
      <SelectRow
        label="Wedges arriving"
        value={enter?.id ?? NONE}
        options={[
          { value: NONE, label: 'None' },
          ...TRANSITION_LIST.map((item) => ({ value: item.id, label: item.name })),
        ]}
        onChange={arm}
      />
      {transition && enter ? (
        <RecipeForm
          fields={transition.fields}
          params={enter.params}
          segments={[]}
          onChange={edit}
        />
      ) : null}
    </PropertyPanel>
  )
}
