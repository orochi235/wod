import { PropertyPanel, SelectRow } from '@weasel-js/labkit'
import { TRANSITION_LIST, getTransition } from '../transition/registry'
import type { Moment, TransitionParams, Transitions } from '../transition/types'
import { RecipeForm } from './RecipeForm'

export type TransitionPanelProps = {
  transitions: Transitions | undefined
  onChange: (transitions: Transitions | undefined) => void
}

const NONE = ''

const MOMENTS: { moment: Moment; label: string }[] = [
  { moment: 'enter', label: 'Wedges arriving' },
  { moment: 'exit', label: 'Wedges leaving' },
]

function without(transitions: Transitions | undefined, moment: Moment): Transitions | undefined {
  const rest = { ...transitions }
  delete rest[moment]
  return Object.keys(rest).length === 0 ? undefined : rest
}

export function TransitionPanel({ transitions, onChange }: TransitionPanelProps) {
  const arm = (moment: Moment) => (value: string) => {
    if (value === NONE) {
      onChange(without(transitions, moment))
      return
    }
    const chosen = getTransition(value)
    if (!chosen) return
    onChange({ ...transitions, [moment]: { id: chosen.id, params: { ...chosen.defaults } } })
  }

  const edit = (moment: Moment) => (params: TransitionParams) => {
    const armed = transitions?.[moment]
    if (!armed) return
    onChange({ ...transitions, [moment]: { ...armed, params } })
  }

  return (
    <PropertyPanel title="Transitions" className="editor__center-panel">
      {MOMENTS.map(({ moment, label }) => {
        const armed = transitions?.[moment]
        const transition = armed ? getTransition(armed.id) : null
        return (
          <div key={moment}>
            <SelectRow
              label={label}
              value={armed?.id ?? NONE}
              options={[
                { value: NONE, label: 'None' },
                ...TRANSITION_LIST.filter((item) => item.moments.includes(moment)).map((item) => ({
                  value: item.id,
                  label: item.name,
                })),
              ]}
              onChange={arm(moment)}
            />
            {transition && armed ? (
              <RecipeForm
                fields={transition.fields}
                params={armed.params}
                segments={[]}
                onChange={edit(moment)}
              />
            ) : null}
          </div>
        )
      })}
    </PropertyPanel>
  )
}
