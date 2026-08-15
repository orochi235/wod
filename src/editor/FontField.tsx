import { SelectRow } from '@weasel-js/labkit'
import { CLASS_NAMES } from '../slice/fonts/catalog'
import { FONT_LIST } from '../slice/fonts/registry'
import { SPECIMENS } from '../slice/fonts/specimens'
import type { FontId } from '../slice/types'

export type FontFieldProps = {
  label: string
  /** Absent follows the look's face. */
  value: FontId | undefined
  onChange: (font: FontId | undefined) => void
}

const FOLLOW = ''

/** The class is what groups the list; a select takes no headings. */
const OPTIONS = [
  { value: FOLLOW, label: "The look's face" },
  ...FONT_LIST.map((font) => ({
    value: font.id,
    label: `${CLASS_NAMES[font.class]} — ${font.name}`,
  })),
]

export function FontField({ label, value, onChange }: FontFieldProps) {
  const specimen = value ? SPECIMENS[value] : undefined

  return (
    <>
      <SelectRow
        label={label}
        value={value ?? FOLLOW}
        options={OPTIONS}
        onChange={(next) => onChange(next === FOLLOW ? undefined : next)}
      />
      {specimen ? (
        // Baked at build time, so a menu of 33 faces loads none of them.
        <svg
          className="parts__specimen"
          viewBox={`0 0 ${specimen.width} ${specimen.height}`}
          height={22}
          width={Math.min(220, (specimen.width * 22) / specimen.height)}
          role="img"
          aria-label={`${value} specimen`}
        >
          <path d={specimen.d} />
        </svg>
      ) : null}
    </>
  )
}
