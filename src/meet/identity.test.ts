import { describe, expect, it } from 'vitest'
import type { Participant } from './api'
import { isBot, itemsForPeople, personOf } from './identity'

const signedin = (name: string, user: string, displayName: string): Participant => ({
  name,
  signedinUser: { user, displayName },
})

describe('personOf', () => {
  // The whole point of the stable id: an override authored today is still
  // waiting for that person in next week's conference.
  it('keys a signed-in participant on the account id, not the conference', () => {
    const monday = personOf(signedin('conferenceRecords/1/participants/x', 'users/7', 'Ana'))
    const tuesday = personOf(signedin('conferenceRecords/2/participants/y', 'users/7', 'Ana'))
    expect(monday.id).toBe('users/7')
    expect(tuesday.id).toBe(monday.id)
    expect(monday.kind).toBe('signedin')
  })

  it('falls back to the slugified name for anonymous and phone participants', () => {
    expect(personOf({ name: 'p/1', anonymousUser: { displayName: 'Guest One' } })).toEqual({
      id: 'guest-one',
      label: 'Guest One',
      kind: 'anonymous',
    })
    expect(personOf({ name: 'p/2', phoneUser: { displayName: 'Ben' } })).toEqual({
      id: 'ben',
      label: 'Ben',
      kind: 'phone',
    })
  })

  it('falls back to the name when a signed-in participant has no account id', () => {
    expect(personOf({ name: 'p/4', signedinUser: { displayName: 'Ana' } })).toEqual({
      id: 'ana',
      label: 'Ana',
      kind: 'signedin',
    })
  })

  it('labels a participant with no display name rather than dropping it', () => {
    const person = personOf({ name: 'p/3' })
    expect(person.kind).toBe('unknown')
    expect(person.label).toBe('(no display name)')
    expect(person.id).not.toBe('')
  })

  it('keeps the kind when a display name is missing, rather than dropping the person', () => {
    expect(personOf({ name: 'p/4', phoneUser: {} })).toEqual({
      id: 'no-display-name',
      label: '(no display name)',
      kind: 'phone',
    })
  })
})

describe('isBot', () => {
  const named = (label: string) => personOf({ name: 'p/1', signedinUser: { displayName: label } })

  it('spots a notetaker whatever it decorates its name with', () => {
    expect(isBot(named('Zoom'))).toBe(true)
    expect(isBot(named('AI Companion'))).toBe(true)
    expect(isBot(named("Ana's AI companion"))).toBe(true)
    expect(isBot(named('Zoom Workplace Notes'))).toBe(true)
  })

  it('leaves people alone', () => {
    expect(isBot(named('Ana'))).toBe(false)
    expect(isBot(named('Ben Companion'))).toBe(false)
    expect(isBot(named('(no display name)'))).toBe(false)
  })
})

describe('itemsForPeople', () => {
  it('passes account ids through and dedupes the fallbacks', () => {
    const items = itemsForPeople([
      personOf(signedin('p/1', 'users/7', 'Ana')),
      personOf({ name: 'p/2', anonymousUser: { displayName: 'Ana' } }),
      personOf({ name: 'p/3', anonymousUser: { displayName: 'Ana' } }),
    ])
    expect(items).toEqual([
      { id: 'users/7', label: 'Ana' },
      { id: 'ana', label: 'Ana' },
      { id: 'ana-2', label: 'Ana' },
    ])
  })
})
