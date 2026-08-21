const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/**
 * A width as the share of the wheel it is, in lowest terms. What a wedge has to
 * hold is a function of how many of them there are, and "1/90" says that where
 * "4°" makes you divide.
 */
export function turnFraction(degrees: number): string {
  const whole = Math.round(degrees * 100)
  const divisor = gcd(whole, 36000)
  return `${whole / divisor}/${36000 / divisor}`
}
