/** Declarative form spec. The editor renders these; the modules that declare them never import React. */
export type Field =
  | { key: string; label: string; kind: 'slider'; min: number; max: number; step: number }
  | { key: string; label: string; kind: 'number'; min?: number; max?: number }
  | { key: string; label: string; kind: 'color' }
  | { key: string; label: string; kind: 'text' }
  /** A face from the font registry. Empty is the theme's own, never a failure. */
  | { key: string; label: string; kind: 'font' }
  | { key: string; label: string; kind: 'toggle' }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }
  /** Multi-select over the current segment list, resolved at render time. */
  | { key: string; label: string; kind: 'segments' }
  /**
   * One wedge, written as a bare id. Distinct from 'segments' because a recipe
   * that reads its value with `readString` cannot be handed an array, and
   * distinct from 'select' because the choices are the live wheel, not a fixed
   * list. Carries no selector tokens: the set-valued ones have no single-id
   * meaning, and '@randomExternal' would need the resolver and the frozen roll
   * plumbed through `provides`, which is a feature rather than this fix.
   */
  | { key: string; label: string; kind: 'segment' }
  /**
   * A repeating list of slice parts. `max` is how many slots the editor offers;
   * the stored list is uncapped, so lifting the cap is a UI change.
   */
  | { key: string; label: string; kind: 'parts'; max: number }
