import { describe, expect, it } from 'vitest'
import { routeFromHash } from './routing'

describe('routeFromHash', () => {
  it('routes #/edit to the editor', () => {
    expect(routeFromHash('#/edit')).toBe('edit')
  })

  it('routes an empty hash to the show page', () => {
    expect(routeFromHash('')).toBe('show')
  })

  it('routes an unknown hash to the show page', () => {
    expect(routeFromHash('#/nonsense')).toBe('show')
  })

  it('ignores a trailing slash', () => {
    expect(routeFromHash('#/edit/')).toBe('edit')
  })

  it('ignores a query string', () => {
    expect(routeFromHash('#/edit?x=1')).toBe('edit')
  })

  it('ignores a query string after a trailing slash', () => {
    expect(routeFromHash('#/edit/?x=1')).toBe('edit')
  })
})
