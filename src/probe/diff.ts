import type { Participant } from './api'

/** How the API identified someone. Only `signedin` reliably carries a name. */
export type PersonKind = 'signedin' | 'anonymous' | 'phone' | 'unknown'

export type Person = { id: string; label: string; kind: PersonKind }

export function personOf(participant: Participant): Person {
  const { signedinUser, anonymousUser, phoneUser } = participant
  const [kind, displayName]: [PersonKind, string | undefined] = signedinUser
    ? ['signedin', signedinUser.displayName]
    : anonymousUser
      ? ['anonymous', anonymousUser.displayName]
      : phoneUser
        ? ['phone', phoneUser.displayName]
        : ['unknown', undefined]

  return { id: participant.name, label: displayName ?? '(no display name)', kind }
}

export type RosterDiff = { joined: Person[]; left: Person[] }

export function rosterDiff(before: Person[], after: Person[]): RosterDiff {
  const had = new Set(before.map((person) => person.id))
  const has = new Set(after.map((person) => person.id))
  return {
    joined: after.filter((person) => !had.has(person.id)),
    left: before.filter((person) => !has.has(person.id)),
  }
}
