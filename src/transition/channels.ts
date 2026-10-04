import { type Kit, kit, last, mul, sum } from '@msb235/blits'

/** Every value a wedge transition animates, as the wedge mix carries it. */
export type PresencePose = {
  share?: number
  opacity?: number
  scale?: number
  offset?: number
  /** Rest-less: absent means the wedge's own angle. */
  offsetAngle?: number
  rotate?: number
  aperture?: number
}

const linear = (a: number, b: number, u: number): number => a + (b - a) * u

export const presenceChannels: Kit<PresencePose> = kit<PresencePose>({
  share: mul({ bounds: [0, 1] }),
  opacity: mul(),
  scale: mul(),
  offset: sum(),
  offsetAngle: last<number>({ lerp: linear }),
  rotate: sum(),
  aperture: mul({ bounds: [0, 1] }),
})
