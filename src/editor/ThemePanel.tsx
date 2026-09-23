import { ColorRow, PropertyPanel, SelectRow } from '@weasel-js/labkit'
import { THEME_LIST, getTheme } from '../wheel/themes/registry'

export type ThemePanelProps = {
  theme: string | undefined
  onChange: (theme: string) => void
  background?: string
  /** Undefined clears it, handing the page back to the look. */
  onBackground?: (background: string | undefined) => void
}

export function ThemePanel({ theme, onChange, background, onBackground }: ThemePanelProps) {
  return (
    <PropertyPanel title="Look" className="editor__center-panel">
      <SelectRow
        label="Wheel"
        value={getTheme(theme ?? '')?.id ?? 'flat'}
        options={THEME_LIST.map((item) => ({ value: item.id, label: item.name }))}
        onChange={onChange}
      />
      {onBackground ? (
        <>
          <ColorRow
            label="Page background"
            value={background ?? '#ffffff'}
            onChange={(next) => onBackground(next)}
          />
          {background === undefined ? null : (
            <button
              type="button"
              className="theme-panel__reset"
              onClick={() => onBackground(undefined)}
            >
              Use the look's background
            </button>
          )}
        </>
      ) : null}
    </PropertyPanel>
  )
}
