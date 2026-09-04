import { describe, expect, it } from 'vitest'
import { NO_NAME, expand, nameFor, namesOf } from './template'

describe('namesOf', () => {
  it('splits a two-part name at the space', () => {
    expect(namesOf('Ana Delacroix')).toEqual({
      name: 'Ana Delacroix',
      first: 'Ana',
      last: 'Delacroix',
    })
  })

  it('keeps everything after the first token as the last name', () => {
    expect(namesOf('Ana Delacroix Ruiz').last).toBe('Delacroix Ruiz')
  })

  it('leaves a mononym with no last name', () => {
    expect(namesOf('Prince')).toEqual({ name: 'Prince', first: 'Prince', last: '' })
  })

  it('ignores surrounding and repeated whitespace', () => {
    expect(namesOf('  Ana   Delacroix  ')).toEqual({
      name: 'Ana Delacroix',
      first: 'Ana',
      last: 'Delacroix',
    })
  })

  it('yields no name at all for blank input', () => {
    expect(namesOf('   ')).toEqual(NO_NAME)
  })
})

describe('expand', () => {
  const ana = namesOf('Ana Delacroix')

  it('substitutes each token', () => {
    expect(expand('{first} {last} — {name}', ana)).toBe('Ana Delacroix — Ana Delacroix')
  })

  it('substitutes every occurrence of a token', () => {
    expect(expand('{first}, {first}, {first}', ana)).toBe('Ana, Ana, Ana')
  })

  it('returns text with no tokens untouched', () => {
    expect(expand('free beer', ana)).toBe('free beer')
  })

  it('leaves an unknown token literal, so authored braces survive', () => {
    expect(expand('{first} wins {whatever}', ana)).toBe('Ana wins {whatever}')
  })

  it('collapses the gap a missing name leaves behind', () => {
    expect(expand('{first} {last} is out', namesOf('Prince'))).toBe('Prince is out')
  })

  it('drops a token entirely on a wedge with no name', () => {
    expect(expand('{first} is out', NO_NAME)).toBe('is out')
  })

  it('can expand to nothing at all', () => {
    expect(expand('{name}', NO_NAME)).toBe('')
  })

  it('is case-sensitive, so {First} is not a token', () => {
    expect(expand('{First}', ana)).toBe('{First}')
  })
})

describe('nameFor', () => {
  const names = new Map([['sim:ana', namesOf('Ana Delacroix')]])

  it('finds a wedge that has a name', () => {
    expect(nameFor(names, 'sim:ana').first).toBe('Ana')
  })

  it('reads a static wedge as nameless', () => {
    expect(nameFor(names, 'seg1')).toEqual(NO_NAME)
  })

  it('reads every wedge as nameless when there is no map at all', () => {
    expect(nameFor(undefined, 'sim:ana')).toEqual(NO_NAME)
  })
})
