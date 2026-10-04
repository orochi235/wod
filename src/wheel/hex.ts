export function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

/** `0xrrggbb`, the form blits' `hex` channel blends. */
export function hexNumber(color: string | undefined): number | undefined {
  const rgb = color === undefined ? null : parseHex(color)
  return rgb ? (rgb[0] << 16) | (rgb[1] << 8) | rgb[2] : undefined
}

export const hexString = (rgb: number): string => `#${rgb.toString(16).padStart(6, '0')}`
