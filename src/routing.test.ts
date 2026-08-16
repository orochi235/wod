import { describe, expect, it } from 'vitest'
import { SAMPLES } from './preset/samples'
import { routeFromHash } from './routing'

describe('routeFromHash', () => {
  it('routes #/edit to the editor', () => {
    expect(routeFromHash('#/edit')).toEqual({ kind: 'edit' })
  })

  it('routes #/slice to the slice studio', () => {
    expect(routeFromHash('#/slice')).toEqual({ kind: 'slice' })
    expect(routeFromHash('#/slice/')).toEqual({ kind: 'slice' })
  })

  it('routes an empty hash to the show page', () => {
    expect(routeFromHash('')).toEqual({ kind: 'show' })
  })

  it('routes an unknown hash to the show page', () => {
    expect(routeFromHash('#/nonsense')).toEqual({ kind: 'show' })
  })

  it('ignores a trailing slash', () => {
    expect(routeFromHash('#/edit/')).toEqual({ kind: 'edit' })
  })

  it('ignores a query string', () => {
    expect(routeFromHash('#/edit?x=1')).toEqual({ kind: 'edit' })
  })

  it('ignores a query string after a trailing slash', () => {
    expect(routeFromHash('#/edit/?x=1')).toEqual({ kind: 'edit' })
  })

  it.each(SAMPLES)('routes #/$id to that sample', (sample) => {
    expect(routeFromHash(`#/${sample.id}`)).toEqual({ kind: 'sample', id: sample.id })
    expect(routeFromHash(`#/${sample.id}/`)).toEqual({ kind: 'sample', id: sample.id })
    expect(routeFromHash(`#/${sample.id}?rig=1`)).toEqual({ kind: 'sample', id: sample.id })
  })

  it('routes a prototype key to the show page', () => {
    // The segment reaches getSample as a string; one that resolves through the
    // prototype chain is not a sample.
    expect(routeFromHash('#/constructor')).toEqual({ kind: 'show' })
    expect(routeFromHash('#/__proto__')).toEqual({ kind: 'show' })
  })
})
