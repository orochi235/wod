import { PropertyField } from '@weasel-js/labkit'

export type SliderFieldProps = {
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (next: number) => void
}

/** A slider row that writes on every move of the drag, not only when it ends. */
export function SliderField({ onChange, ...rest }: SliderFieldProps) {
  return (
    <PropertyField
      kind="number"
      control="slider"
      {...rest}
      onInput={onChange}
      onChange={onChange}
    />
  )
}
