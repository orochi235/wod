import { describe, expect, it } from 'vitest'
import { type ConferenceRecord, matchesPin, normalizePin, pickConference } from './api'

const record = (id: string): ConferenceRecord => ({ name: `conferenceRecords/${id}` })

describe('pickConference', () => {
  it('takes the sole conference when nothing is pinned', () => {
    expect(pickConference([record('a')], '')).toEqual(record('a'))
  })

  // The failure this exists to prevent: watching someone else's meeting and
  // believing the roster.
  it('refuses to choose between several', () => {
    expect(pickConference([record('a'), record('b')], '')).toBeNull()
  })

  it('honors a pin, as a bare id or a full resource name', () => {
    const records = [record('a'), record('b')]
    expect(pickConference(records, 'b')).toEqual(record('b'))
    expect(pickConference(records, 'conferenceRecords/b')).toEqual(record('b'))
  })

  it('is null when the pinned conference is not in progress', () => {
    expect(pickConference([record('a')], 'gone')).toBeNull()
  })

  it('is null with nothing in progress', () => {
    expect(pickConference([], '')).toBeNull()
  })
})

describe('normalizePin', () => {
  it('passes a bare id through unchanged', () => {
    expect(normalizePin('a')).toBe('a')
  })

  it('strips the conferenceRecords/ prefix from a full resource name', () => {
    expect(normalizePin('conferenceRecords/a')).toBe('a')
  })

  it('trims surrounding whitespace, including around a full resource name', () => {
    expect(normalizePin('  a  ')).toBe('a')
    expect(normalizePin('  conferenceRecords/a  ')).toBe('a')
  })

  it('normalizes an empty or whitespace-only pin to the empty string', () => {
    expect(normalizePin('')).toBe('')
    expect(normalizePin('   ')).toBe('')
  })
})

describe('matchesPin', () => {
  it('accepts anything when nothing is pinned', () => {
    expect(matchesPin('conferenceRecords/a', '')).toBe(true)
    expect(matchesPin('conferenceRecords/a', '   ')).toBe(true)
  })

  it('accepts a pin as a bare id or a full resource name', () => {
    expect(matchesPin('conferenceRecords/a', 'a')).toBe(true)
    expect(matchesPin('conferenceRecords/a', 'conferenceRecords/a')).toBe(true)
  })

  // The failure this exists to prevent: a cached conference outliving the pin
  // that selected it, so the wheel keeps showing a meeting nobody asked for.
  it('rejects a conference the pin does not name', () => {
    expect(matchesPin('conferenceRecords/a', 'b')).toBe(false)
  })
})
