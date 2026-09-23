/** The recorded one-shots under `public/outage/`; see CREDITS.md there. */
export const KIT_FILES = [
  'rimshot',
  'rimshot-soft',
  'stickshot',
  'snare',
  'tom-rimshot',
  'tom',
  'kick',
] as const

export type KitSound = (typeof KIT_FILES)[number]
export type Kit = Partial<Record<KitSound, AudioBuffer>>

/**
 * Fetches and decodes the kit. A sound that fails to load is simply absent, and
 * the voice that wanted it falls back to its synthesized part alone.
 */
export async function loadKit(
  ctx: BaseAudioContext,
  base: string = import.meta.env.BASE_URL,
): Promise<Kit> {
  const entries = await Promise.all(
    KIT_FILES.map(async (name) => {
      try {
        const response = await fetch(`${base}outage/${name}.wav`)
        if (!response.ok) return null
        return [name, await ctx.decodeAudioData(await response.arrayBuffer())] as const
      } catch {
        return null
      }
    }),
  )
  return Object.fromEntries(entries.filter((entry) => entry !== null))
}
