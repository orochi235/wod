import { slugify, withUniqueIds } from '../feed/identity'
import type { FeedItem } from '../feed/types'
import type { Participant } from './api'

/** How the API identified someone. Only `signedin` reliably carries a name. */
export type PersonKind = 'signedin' | 'anonymous' | 'phone' | 'unknown'

export type Person = { id: string; label: string; kind: PersonKind }

/**
 * The id is the account id where there is one, because it is the same person in
 * every conference and overrides are keyed by item id — the participant
 * resource name would tie each override to one meeting.
 *
 * Anonymous, phone, and nameless participants have no such id and fall back to
 * the name, so two nameless guests collapse to one id here. `itemsForPeople`
 * splits them apart for the wheel; the probe's roster diff does not, and counts
 * them as one person.
 */
export function personOf(participant: Participant): Person {
  const { signedinUser, anonymousUser, phoneUser } = participant
  const [kind, displayName]: [PersonKind, string | undefined] = signedinUser
    ? ['signedin', signedinUser.displayName]
    : anonymousUser
      ? ['anonymous', anonymousUser.displayName]
      : phoneUser
        ? ['phone', phoneUser.displayName]
        : ['unknown', undefined]

  const label = displayName ?? '(no display name)'
  return { id: signedinUser?.user ?? slugify(label), label, kind }
}

/**
 * Lowercased, and matched anywhere in the name: a notetaker joins under a name
 * it decorates ("Zoom Workplace", "Ana's AI Companion"), not a fixed string.
 */
const BOT_NAMES = ['zoom', 'ai companion']

/**
 * Whether a participant is a bot rather than someone in the room. Nothing in
 * the API marks one — a notetaker arrives as an ordinary participant — so the
 * name is all there is to go on.
 */
export function isBot(person: Person): boolean {
  const name = person.label.toLowerCase()
  return BOT_NAMES.some((bot) => name.includes(bot))
}

export function itemsForPeople(people: Person[]): FeedItem[] {
  return withUniqueIds(people)
}
