import type { FeedItem } from '../feed/types'
import {
  type Participant,
  activeParticipants,
  liveConferences,
  matchesPin,
  pickConference,
} from './api'
import { isBot, itemsForPeople, personOf } from './identity'

export type RosterSnapshot = {
  /** What to hand back as `cached` next tick. Null means nothing was watched. */
  conference: string | null
  items: FeedItem[]
  /** How many conferences were in progress. Meaningful only when `conference` is null. */
  live: number
}

/** The wheel's roster: everyone in the conference who is a person. */
function peopleOn(participants: Participant[]): FeedItem[] {
  return itemsForPeople(participants.map(personOf).filter((person) => !isBot(person)))
}

/**
 * One poll. Throws whatever the API threw — the caller decides what a failure
 * does to the roster on screen, and the answer is nothing.
 */
export async function fetchRoster(
  token: string,
  pin: string,
  cached: string | null,
): Promise<RosterSnapshot> {
  if (cached !== null && matchesPin(cached, pin)) {
    const people = await activeParticipants(cached, token)
    // A non-empty roster proves the conference is still live. An empty one is
    // indistinguishable from one that ended, so fall through and re-list.
    if (people.length > 0) {
      return { conference: cached, items: peopleOn(people), live: 0 }
    }
  }

  const records = await liveConferences(token)
  const conference = pickConference(records, pin)
  if (conference === null) return { conference: null, items: [], live: records.length }

  const people = await activeParticipants(conference.name, token)
  return { conference: conference.name, items: peopleOn(people), live: 0 }
}
