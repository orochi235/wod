import type { Person } from '../meet/identity'

export type RosterDiff = { joined: Person[]; left: Person[] }

export function rosterDiff(before: Person[], after: Person[]): RosterDiff {
  const had = new Set(before.map((person) => person.id))
  const has = new Set(after.map((person) => person.id))
  return {
    joined: after.filter((person) => !had.has(person.id)),
    left: before.filter((person) => !has.has(person.id)),
  }
}
