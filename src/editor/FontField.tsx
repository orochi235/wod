import { SelectRow } from '@weasel-js/labkit'
import { CLASS_NAMES } from '../slice/fonts/catalog'
import { FONT_LIST, getFont } from '../slice/fonts/registry'
import { specimenText } from '../slice/fonts/specimen'
import { familyStack } from '../slice/measure'
import type { FontId } from '../slice/types'
import { useFaces } from '../wheel/useFaces'

export type FontFieldProps = {
  label: string
  /** Absent follows the look's face. */
  value: FontId | undefined
  onChange: (font: FontId | undefined) => void
  /** What the specimen is set in. Absent takes the url's, then the built-in. */
  specimen?: string
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

export function FontField({ label, value, onChange, specimen }: FontFieldProps) {
  const font = getFont(value)
  // The one face the picker is showing, which is the one about to be used. The
  // wheel asks for the same face through the same loader, so picking it here
  // costs nothing twice.
  useFaces(font ? [{ id: font.id, family: font.family, outline: false }] : [])
  const text = specimenText(specimen)

  return (
    <>
      <SelectRow
        label={label}
        value={value ?? FOLLOW}
        options={OPTIONS}
        onChange={(next) => onChange(next === FOLLOW ? undefined : next)}
      />
      {font ? (
        // The family is data — which of thirty-three faces — so it rides an
        // inline style rather than thirty-three classes. It is the only thing
        // here that is not in the stylesheet.
        <p
          className="parts__specimen"
          data-specimen={font.id}
          style={{ fontFamily: familyStack(font.family) }}
        >
          {text}
        </p>
      ) : null}
    </>
  )
}
