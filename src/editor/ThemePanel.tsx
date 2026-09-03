import { PropertyPanel, SelectRow } from '@weasel-js/labkit'
import { THEME_LIST, getTheme } from '../wheel/themes/registry'

export type ThemePanelProps = {
  theme: string | undefined
  onChange: (theme: string) => void
}

export function ThemePanel({ theme, onChange }: ThemePanelProps) {
  return (
    <PropertyPanel title="Look" className="editor__center-panel">
      <SelectRow
        label="Wheel"
        value={getTheme(theme ?? '')?.id ?? 'flat'}
        options={THEME_LIST.map((item) => ({ value: item.id, label: item.name }))}
        onChange={onChange}
      />
    </PropertyPanel>
  )
}
