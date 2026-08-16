/**
 * The luminance at which the look's ink and its inverse are equally legible on
 * a wedge — solved for `#12151b` on one side and `#f7f3e8` on the other, which
 * is what the shipped tokens carry. Near enough to the 0.179 that the WCAG
 * black-or-white rule of thumb lands on.
 */
const CROSSOVER = 0.18

const linear = (channel: number): number =>
  channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

/** #rgb and #rrggbb only. Anything else is a color this cannot judge. */
function channels(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, '')
  const short = hex.length === 3
  if (!short && hex.length !== 6) return null
  if (!/^[0-9a-f]+$/i.test(hex)) return null

  const at = (i: number): number =>
    short
      ? Number.parseInt(hex[i] + hex[i], 16) / 255
      : Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255

  return [at(0), at(1), at(2)]
}

export function luminance(color: string): number | null {
  const rgb = channels(color)
  if (!rgb) return null
  const [r, g, b] = rgb.map(linear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Whether a wedge this color has to be lettered in the look's inverse ink. A
 * color it cannot read keeps today's ink: the wheel's own palette is nowhere
 * near the crossover, so guessing would only ever be wrong.
 */
export function wantsInverseInk(color: string | undefined): boolean {
  if (color === undefined) return false
  const value = luminance(color)
  return value !== null && value < CROSSOVER
}
