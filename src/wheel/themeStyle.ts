import type { CSSProperties } from 'react'
import type { Theme } from './theme'

/** Only the two scopes the stylesheet reads. A stored theme does not get to set anything else. */
const SCOPES = ['--wheel-', '--wedge-']

export function styleOfTheme(theme: Theme): CSSProperties {
  const style: Record<string, string> = {}
  for (const [name, value] of Object.entries(theme.tokens)) {
    if (!SCOPES.some((scope) => name.startsWith(scope))) continue
    const trimmed = value.trim()
    if (trimmed === '') continue
    // React writes the value verbatim, so a semicolon would end this
    // declaration and start one the theme was not entitled to.
    if (trimmed.includes(';')) continue
    style[name] = trimmed
  }
  return style as CSSProperties
}
