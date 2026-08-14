import { describe, expect, it } from 'vitest'
import { type ConferenceRecord, pickConference } from './api'

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
