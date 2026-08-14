import { PropertyPanel, SelectRow } from '@weasel-js/labkit'
import { TRANSITION_LIST, getTransition } from '../transition/registry'
import type { TransitionParams, Transitions } from '../transition/types'
import { RecipeForm } from './RecipeForm'

export type TransitionPanelProps = {
  transitions: Transitions | undefined
  onChange: (transitions: Transitions | undefined) => void
}

const NONE = ''

function withoutEnter(transitions: Transitions | undefined): Transitions | undefined {
  const { enter, ...rest } = transitions ?? {}
  return Object.keys(rest).length === 0 ? undefined : rest
}

export function TransitionPanel({ transitions, onChange }: TransitionPanelProps) {
  const enter = transitions?.enter
  const transition = enter ? getTransition(enter.id) : null

  const arm = (value: string) => {
    if (value === NONE) {
      onChange(withoutEnter(transitions))
      return
    }
    const chosen = getTransition(value)
    if (!chosen) return
    onChange({ ...transitions, enter: { id: chosen.id, params: { ...chosen.defaults } } })
  }

  const edit = (params: TransitionParams) => {
    if (!enter) return
    onChange({ ...transitions, enter: { ...enter, params } })
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
