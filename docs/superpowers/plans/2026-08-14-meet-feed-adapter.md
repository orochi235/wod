# Meet Feed Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the live Google Meet roster on the wheel, as a second feed alongside the simulated one.

**Architecture:** A new `src/meet/` module owns the Google API client, identity, auth, and a single-poll function. The editor window owns the clock and publishes items on the existing `BroadcastChannel` feed bus, exactly as it already does for the simulator. Nothing in `src/wheel`, `src/compose`, or the show page changes.

**Tech Stack:** Vite + React 19 + TypeScript (strict), Vitest + Testing Library, Biome. Google Identity Services (`accounts.google.com/gsi/client`) for auth; Meet REST API v2 for the roster.

**Spec:** `docs/superpowers/specs/2026-08-14-meet-feed-adapter-design.md`

**Commands:** `npm test` runs everything once. `npx vitest run src/meet/identity.test.ts -t 'name'` runs one test. `npm run check` formats and lints (Biome, recommended rules — `useExhaustiveDependencies` is on, so effect and memo dependency arrays must be complete). `npm run build` typechecks (`tsc --noEmit`) and builds.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/feed/identity.ts` | **New.** `slugify` and `withUniqueIds`, shared by both feeds |
| `src/feed/simulated.ts` | Loses `slugify` and the dedupe loop; keeps `churn`, `itemsFor` |
| `src/feed/types.ts` | Gains `MeetFeedConfig`; `FeedConfig` becomes a real union; `Feed` marked inactive |
| `src/meet/api.ts` | **New (moved).** The three Meet REST calls, `MeetApiError`, pin helpers |
| `src/meet/identity.ts` | **New (moved).** `Person`, `personOf`, `itemsForPeople` |
| `src/meet/auth.ts` | **New.** GIS token client, expiry math, reconnect threshold |
| `src/meet/roster.ts` | **New.** `fetchRoster` — one poll, including conference resolution |
| `src/probe/api.ts` | **Deleted** — re-exported from `src/meet/api.ts` |
| `src/probe/diff.ts` | Keeps `rosterDiff` only; `Person`/`personOf` move out |
| `src/editor/MeetPanel.tsx` | **New.** Connection, conference, interval, roster, errors; owns the poll clock |
| `src/editor/Editor.tsx` | Becomes a multi-feed publisher |
| `src/preset/storage.ts` | `readFeeds` dispatches on `kind`; preset version 4 |
| `.github/workflows/deploy.yml` | Injects `VITE_MEET_CLIENT_ID` |

---

### Task 1: Share slug and dedupe between feeds

**Files:**
- Create: `src/feed/identity.ts`
- Create: `src/feed/identity.test.ts`
- Modify: `src/feed/simulated.ts:61-118`

- [ ] **Step 1: Write the failing test**

Create `src/feed/identity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { slugify, withUniqueIds } from './identity'

describe('slugify', () => {
  it('keeps letters, numbers, and combining marks', () => {
    expect(slugify('Ana')).toBe('ana')
    expect(slugify('नमस्ते')).toBe('नमस्ते')
    expect(slugify('Jo Smith-Jones')).toBe('jo-smith-jones')
  })

  it('never emits a colon, which would make a wedge id ambiguous', () => {
    expect(slugify('a:b')).toBe('a-b')
  })

  it('falls back rather than returning an empty id', () => {
    expect(slugify('!!!')).toBe('item')
  })
})

describe('withUniqueIds', () => {
  it('keeps a preferred id when nothing collides', () => {
    expect(withUniqueIds([{ id: 'ana', label: 'Ana' }])).toEqual([{ id: 'ana', label: 'Ana' }])
  })

  it('suffixes collisions in list order', () => {
    expect(
      withUniqueIds([
        { id: 'ana', label: 'Ana' },
        { id: 'ana', label: 'Ana' },
        { id: 'ana', label: 'Ana' },
      ]),
    ).toEqual([
      { id: 'ana', label: 'Ana' },
      { id: 'ana-2', label: 'Ana' },
      { id: 'ana-3', label: 'Ana' },
    ])
  })

  it('keeps a label that differs from the id', () => {
    expect(withUniqueIds([{ id: 'users/1', label: 'Ana' }])).toEqual([
      { id: 'users/1', label: 'Ana' },
    ])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/feed/identity.test.ts`
Expected: FAIL — `Failed to resolve import "./identity"`.

- [ ] **Step 3: Create the module**

Create `src/feed/identity.ts`. Move `slugify` out of `src/feed/simulated.ts` **verbatim, including its whole doc comment** — that comment explains the Unicode class choice and the colon ban, and it is the reason the function looks the way it does. Add `export` to it. Then add:

```ts
import type { FeedItem } from './types'

/**
 * Gives every entry the first free id derived from its preferred one, so a
 * feed that cannot guarantee unique ids still produces unique wedges. Ids that
 * are already unique — a signed-in account id — pass through untouched.
 */
export function withUniqueIds(entries: { id: string; label: string }[]): FeedItem[] {
  const items: FeedItem[] = []
  for (const entry of entries) {
    let id = entry.id
    let n = 2
    while (items.some((item) => item.id === id)) {
      id = `${entry.id}-${n}`
      n += 1
    }
    items.push({ id, label: entry.label })
  }
  return items
}
```

- [ ] **Step 4: Rewrite `itemsFor` on top of it**

In `src/feed/simulated.ts`, delete `slugify` and the body of `itemsFor`, and import from the new module. Keep `itemsFor`'s doc comment, but replace its final paragraph — the one deferring the collision caveat "until the Meet adapter supplies" a participant id — with a pointer, since Task 3 is that moment:

```ts
import { slugify, withUniqueIds } from './identity'

/**
 * Ids derive from the name rather than from a counter, so leaving and rejoining
 * returns the same id and whatever override was saved against it.
 *
 * Two people with the same name still share one id, and a third whose own name
 * collides with the suffixed form takes it in list order. A simulated meeting
 * has no identity to key on but the name; the Meet feed keys on the account id
 * and does not have this problem.
 */
export function itemsFor(present: string[]): FeedItem[] {
  return withUniqueIds(present.map((name) => ({ id: slugify(name), label: name })))
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. `src/feed/simulated.test.ts` covers `itemsFor` today and must stay green untouched — that is the proof this refactor changed nothing.

- [ ] **Step 6: Commit**

```bash
git add src/feed/identity.ts src/feed/identity.test.ts src/feed/simulated.ts
git commit -m "refactor(feed): share slug and dedupe between feeds"
```

---

### Task 2: Move the Meet API client out of the probe

**Files:**
- Create: `src/meet/api.ts` (moved from `src/probe/api.ts`)
- Create: `src/meet/api.test.ts` (moved from `src/probe/api.test.ts`)
- Delete: `src/probe/api.ts`, `src/probe/api.test.ts`
- Modify: `src/probe/Probe.tsx:2`, `src/probe/diff.ts:1`

- [ ] **Step 1: Move the files**

```bash
mkdir -p src/meet
git mv src/probe/api.ts src/meet/api.ts
git mv src/probe/api.test.ts src/meet/api.test.ts
```

- [ ] **Step 2: Write the failing test for the new pin helpers**

Append to `src/meet/api.test.ts`:

```ts
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
```

Add `matchesPin` to the import on line 2 of that file.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/meet/api.test.ts`
Expected: FAIL — `matchesPin is not a function`.

- [ ] **Step 4: Add the helpers and rename the error**

In `src/meet/api.ts`, rename `ProbeError` to `MeetApiError` (class name and both usages inside `get`), and add above `pickConference`:

```ts
export function normalizePin(pin: string): string {
  return pin.trim().replace(/^conferenceRecords\//, '')
}

/** Whether a conference satisfies the pin. An empty pin is satisfied by any. */
export function matchesPin(name: string, pin: string): boolean {
  const wanted = normalizePin(pin)
  return wanted === '' || name === `conferenceRecords/${wanted}`
}
```

Rewrite `pickConference`'s body to use them, leaving its doc comment alone:

```ts
export function pickConference(records: ConferenceRecord[], pin: string): ConferenceRecord | null {
  if (normalizePin(pin) !== '') {
    return records.find((record) => matchesPin(record.name, pin)) ?? null
  }
  return records.length === 1 ? records[0] : null
}
```

- [ ] **Step 5: Point the probe at the new home**

In `src/probe/Probe.tsx` line 2, change the import path to `../meet/api` and `ProbeError` to `MeetApiError` (it appears again at line 190 in the `instanceof` check). In `src/probe/diff.ts` line 1, change the import path to `../meet/api`.

- [ ] **Step 6: Run the suite and the typechecker**

Run: `npm test && npm run build`
Expected: PASS, and no TypeScript errors. A missed `ProbeError` reference fails the build.

- [ ] **Step 7: Commit**

```bash
git add -A src/meet src/probe
git commit -m "refactor(meet): move the API client out of the probe"
```

---

### Task 3: Key identity on the signed-in account id

**Files:**
- Create: `src/meet/identity.ts`
- Create: `src/meet/identity.test.ts`
- Modify: `src/probe/diff.ts`, `src/probe/diff.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/meet/identity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Participant } from './api'
import { itemsForPeople, personOf } from './identity'

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

  it('labels a participant with no display name rather than dropping it', () => {
    const person = personOf({ name: 'p/3' })
    expect(person.kind).toBe('unknown')
    expect(person.label).toBe('(no display name)')
    expect(person.id).not.toBe('')
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/meet/identity.test.ts`
Expected: FAIL — `Failed to resolve import "./identity"`.

- [ ] **Step 3: Write the module**

Create `src/meet/identity.ts`. `PersonKind` and `Person` move here from `src/probe/diff.ts`; `personOf` moves and changes its id rule:

```ts
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

export function itemsForPeople(people: Person[]): FeedItem[] {
  return withUniqueIds(people)
}
```

- [ ] **Step 4: Strip `src/probe/diff.ts` down to the diff**

Delete `PersonKind`, `Person`, and `personOf` from it. It keeps `RosterDiff` and `rosterDiff` and re-exports the type it takes:

```ts
import type { Person } from '../meet/identity'

export type { Person } from '../meet/identity'

export type RosterDiff = { joined: Person[]; left: Person[] }

export function rosterDiff(before: Person[], after: Person[]): RosterDiff {
  const had = new Set(before.map((person) => person.id))
  const has = new Set(after.map((person) => person.id))
  return {
    joined: after.filter((person) => !had.has(person.id)),
    left: before.filter((person) => !has.has(person.id)),
  }
}
```

`Probe.tsx` imports `personOf` from `./diff` today (line 3) — change that import to pull `personOf` from `../meet/identity` and keep `type Person` and `rosterDiff` from `./diff`.

- [ ] **Step 5: Move the probe's identity tests**

`src/probe/diff.test.ts` covers both `personOf` and `rosterDiff`. Move the `personOf` cases to `src/meet/identity.test.ts` if they add anything the tests above don't, and delete them from `diff.test.ts` otherwise. Any assertion there that expects `id` to be the participant resource name is now wrong and must be updated to the account id — that expectation was the bug this task fixes.

- [ ] **Step 6: Run the suite**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src/meet src/probe
git commit -m "feat(meet): key participant identity on the account id"
```

---

### Task 4: The `meet` feed config

**Files:**
- Modify: `src/feed/types.ts`
- Create: `src/meet/poll.ts`

- [ ] **Step 1: Add the config type**

In `src/feed/types.ts`, after `SimulatedFeedConfig`:

```ts
export type MeetFeedConfig = FeedConfigBase & {
  kind: 'meet'
  /** Blank means the sole conference in progress. A pin is a conferenceRecords id. */
  conference: string
  intervalMs: number
}

export type FeedConfig = SimulatedFeedConfig | MeetFeedConfig
```

Delete the `/** A union of one... */` comment above the old `FeedConfig`.

- [ ] **Step 2: Mark `Feed` inactive**

Replace the doc comment on `Feed` in the same file. It currently describes a contract "the deferred Google Meet adapter is expected to implement." That adapter now exists and does not:

```ts
/**
 * Inactive. Nothing implements this and nothing imports it.
 *
 * It was held open for the Meet adapter, which does not implement it either:
 * the clock lives in the editor and the transport on the bus, so a `subscribe`
 * would be called once by a `useEffect` that already handles its own teardown,
 * and a token that expires mid-meeting cannot reach a closure made at
 * subscribe time.
 */
export type Feed = {
  id: string
  subscribe(cb: (items: FeedItem[]) => void): Unsubscribe
}
```

- [ ] **Step 3: Add the poll floor**

Create `src/meet/poll.ts`:

```ts
/**
 * One poll costs 700-1000ms of round trip against a live conference, so a
 * shorter period spends most of itself in flight. Lives here rather than with
 * the preset parser for the reason MIN_CHURN_INTERVAL_MS does: every caller
 * that starts a clock has to honor it, and the parser is only one of them.
 */
export const MIN_POLL_INTERVAL_MS = 2000
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: FAIL, and read the failures — this is the change that reveals every place assuming one simulated feed. `Editor.tsx` (`FeedPanel config={feed}`) and `storage.ts` are expected; anything else is a site Task 10 has to cover. Write the list down.

- [ ] **Step 5: Commit**

The build does not pass yet, so commit the types alone and let the next task make it compile.

```bash
git add src/feed/types.ts src/meet/poll.ts
git commit -m "feat(feed): add the meet feed config"
```

---

### Task 5: Parse and persist a meet feed

**Files:**
- Modify: `src/preset/storage.ts:385-421`, `src/preset/storage.ts:458`, `src/preset/storage.ts:473`
- Modify: `src/preset/storage.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `readFeeds` area of `src/preset/storage.test.ts`, following the file's existing style for building raw stored JSON:

```ts
it('reads a meet feed', () => {
  const preset = parsePreset(
    JSON.stringify({
      version: 4,
      feeds: [
        { kind: 'meet', id: 'meet', defaults: { weight: 2 }, conference: 'abc', intervalMs: 8000 },
      ],
    }),
  )
  expect(preset.feeds).toEqual([
    { kind: 'meet', id: 'meet', defaults: { weight: 2 }, conference: 'abc', intervalMs: 8000 },
  ])
})

it('floors a meet feed interval', () => {
  const preset = parsePreset(
    JSON.stringify({
      version: 4,
      feeds: [{ kind: 'meet', id: 'meet', conference: '', intervalMs: 100 }],
    }),
  )
  expect(preset.feeds[0]).toMatchObject({ intervalMs: MIN_POLL_INTERVAL_MS })
})

it('defaults a missing conference to the sole one in progress', () => {
  const preset = parsePreset(
    JSON.stringify({ version: 4, feeds: [{ kind: 'meet', id: 'meet' }] }),
  )
  expect(preset.feeds[0]).toMatchObject({ conference: '', intervalMs: 5000 })
})

it('still drops a kind it does not know', () => {
  const preset = parsePreset(
    JSON.stringify({ version: 4, feeds: [{ kind: 'zoom', id: 'z' }] }),
  )
  expect(preset.feeds).toEqual([])
})

it('keeps both feeds when a preset has one of each', () => {
  const preset = parsePreset(
    JSON.stringify({
      version: 4,
      feeds: [
        { kind: 'simulated', id: 'sim', pool: ['Fay'] },
        { kind: 'meet', id: 'meet' },
      ],
    }),
  )
  expect(preset.feeds.map((feed) => feed.kind)).toEqual(['simulated', 'meet'])
})
```

Import `MIN_POLL_INTERVAL_MS` from `../meet/poll` at the top of the test file.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/preset/storage.test.ts -t 'meet'`
Expected: FAIL — feeds come back `[]`, because `readFeeds` drops everything that is not `simulated`.

- [ ] **Step 3: Split `readFeeds` by kind**

In `src/preset/storage.ts`, replace the body of the loop in `readFeeds`. The three guards that apply to every kind stay where they are; only the construction branches:

```ts
    if (typeof entry.id !== 'string') continue
    if (entry.id === PROTO_KEY) continue
    if (feeds.some((feed) => feed.id === entry.id)) continue

    let feed: FeedConfig
    if (entry.kind === 'simulated') {
      const autochurn = isRecord(entry.autochurn) ? entry.autochurn : {}
      feed = {
        kind: 'simulated',
        id: entry.id,
        defaults: readFeedDefaults(entry.defaults),
        pool: Array.isArray(entry.pool)
          ? entry.pool.filter((name): name is string => typeof name === 'string')
          : [],
        autochurn: {
          intervalMs: Math.max(MIN_CHURN_INTERVAL_MS, readPositive(autochurn.intervalMs, 2000)),
          targetSize: readCount(autochurn.targetSize, 6),
          volatility: readUnitValue(autochurn.volatility, 0.3),
        },
      }
    } else if (entry.kind === 'meet') {
      feed = {
        kind: 'meet',
        id: entry.id,
        defaults: readFeedDefaults(entry.defaults),
        conference: typeof entry.conference === 'string' ? entry.conference : '',
        intervalMs: Math.max(MIN_POLL_INTERVAL_MS, readPositive(entry.intervalMs, 5000)),
      }
    } else {
      // Dropped rather than disabled as readTricks would: an unknown kind has
      // no shape this parser can construct. A build that adds one bumps the
      // version, and the gate in parsePreset rejects newer data wholesale.
      continue
    }

    if (typeof entry.insertAfter === 'string') feed.insertAfter = entry.insertAfter
    feeds.push(feed)
```

Replace the stale comment above the old `kind` guard with nothing — the `else` branch above now carries it. Import `MIN_POLL_INTERVAL_MS` from `../meet/poll`.

- [ ] **Step 4: Bump the preset version**

Line 458 becomes:

```ts
  if (data.version !== 1 && data.version !== 2 && data.version !== 3 && data.version !== 4) {
    return DEFAULT_PRESET
  }
```

Line 473 becomes `version: 4`. In `src/preset/defaults.ts` line 9, `version: 4`. In `src/preset/types.ts` line 54, the field is the literal `version: 3` — make it `version: 4`.

`DEFAULT_PRESET` gains no meet feed — a fresh browser must not ask anyone to sign in to Google. Task 11 adds one on request.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS. Existing tests asserting `version: 3` on a parsed preset now expect 4; update them. A test that feeds `version: 3` data and expects it to parse must stay — old presets still load.

- [ ] **Step 6: Commit**

```bash
git add src/preset src/feed
git commit -m "feat(preset): parse the meet feed, at preset version 4"
```

---

### Task 6: One poll

**Files:**
- Create: `src/meet/roster.ts`
- Create: `src/meet/roster.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/meet/roster.test.ts`. `fetch` is the only seam:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRoster } from './roster'

type Reply = { url: RegExp; body: unknown }

/** Answers each call with the first reply whose url matches, and records calls. */
function stubFetch(replies: Reply[]): string[] {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const reply = replies.find((candidate) => candidate.url.test(url))
      if (!reply) throw new Error(`unexpected fetch: ${url}`)
      return { ok: true, json: async () => reply.body } as Response
    }),
  )
  return calls
}

const conferences = (...ids: string[]) => ({
  url: /conferenceRecords\?/,
  body: { conferenceRecords: ids.map((id) => ({ name: `conferenceRecords/${id}` })) },
})

const participants = (...names: string[]) => ({
  url: /participants\?/,
  body: {
    participants: names.map((name, index) => ({
      name: `p/${index}`,
      signedinUser: { user: `users/${index}`, displayName: name },
    })),
  },
})

afterEach(() => vi.unstubAllGlobals())

describe('fetchRoster', () => {
  it('resolves the sole conference and returns its roster', async () => {
    stubFetch([conferences('a'), participants('Ana', 'Ben')])
    const snapshot = await fetchRoster('tok', '', null)
    expect(snapshot.conference).toBe('conferenceRecords/a')
    expect(snapshot.items).toEqual([
      { id: 'users/0', label: 'Ana' },
      { id: 'users/1', label: 'Ben' },
    ])
  })

  // The saving worth having: at 5s a poll, the list call is pure overhead.
  it('costs one request once the conference is known', async () => {
    const calls = stubFetch([conferences('a'), participants('Ana')])
    await fetchRoster('tok', '', 'conferenceRecords/a')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('participants')
  })

  it('re-lists when the cached conference comes back empty', async () => {
    const calls = stubFetch([conferences('b'), participants()])
    const snapshot = await fetchRoster('tok', '', 'conferenceRecords/a')
    expect(calls).toHaveLength(3)
    expect(snapshot.conference).toBe('conferenceRecords/b')
  })

  it('ignores a cached conference the pin no longer names', async () => {
    const calls = stubFetch([conferences('b'), participants('Ana')])
    const snapshot = await fetchRoster('tok', 'b', 'conferenceRecords/a')
    expect(snapshot.conference).toBe('conferenceRecords/b')
    expect(calls[0]).toContain('conferenceRecords?')
  })

  it('watches nothing when several are in progress and none is pinned', async () => {
    stubFetch([conferences('a', 'b')])
    const snapshot = await fetchRoster('tok', '', null)
    expect(snapshot).toEqual({ conference: null, items: [], candidates: 2 })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/meet/roster.test.ts`
Expected: FAIL — `Failed to resolve import "./roster"`.

- [ ] **Step 3: Write the module**

Create `src/meet/roster.ts`:

```ts
import type { FeedItem } from '../feed/types'
import { activeParticipants, liveConferences, matchesPin, pickConference } from './api'
import { itemsForPeople, personOf } from './identity'

export type RosterSnapshot = {
  /** What to hand back as `cached` next tick. Null means nothing was watched. */
  conference: string | null
  items: FeedItem[]
  /** Conferences in progress when none could be chosen; 0 when one was. */
  candidates: number
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
      return { conference: cached, items: itemsForPeople(people.map(personOf)), candidates: 0 }
    }
  }

  const records = await liveConferences(token)
  const conference = pickConference(records, pin)
  if (conference === null) return { conference: null, items: [], candidates: records.length }

  const people = await activeParticipants(conference.name, token)
  return { conference: conference.name, items: itemsForPeople(people.map(personOf)), candidates: 0 }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/meet/roster.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/meet/roster.ts src/meet/roster.test.ts
git commit -m "feat(meet): fetch one roster snapshot per poll"
```

---

### Task 7: Auth

**Files:**
- Create: `src/meet/auth.ts`, `src/meet/auth.test.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Let TypeScript see `import.meta.env`**

In `tsconfig.json`, add `"vite/client"` to the `types` array:

```json
    "types": ["vitest/globals", "@testing-library/jest-dom", "vite/client"]
```

- [ ] **Step 2: Write the failing test**

Create `src/meet/auth.test.ts`. Only the pure parts are tested directly; the script tag and the popup are exercised through `MeetPanel` in Task 9:

```ts
import { describe, expect, it } from 'vitest'
import { RENEW_MARGIN_MS, isUsable, tokenOf } from './auth'

describe('tokenOf', () => {
  it('stamps the expiry from the response lifetime', () => {
    expect(tokenOf({ access_token: 'ya29.x', expires_in: 3600 }, 1_000)).toEqual({
      value: 'ya29.x',
      expiresAt: 1_000 + 3_600_000,
    })
  })

  it('is null when the response carries no token', () => {
    expect(tokenOf({ error: 'access_denied' }, 0)).toBeNull()
    expect(tokenOf({ access_token: '' }, 0)).toBeNull()
  })

  // A response with no lifetime is not a token worth trusting for an hour.
  it('treats a missing lifetime as already expired', () => {
    expect(tokenOf({ access_token: 'ya29.x' }, 1_000)).toEqual({
      value: 'ya29.x',
      expiresAt: 1_000,
    })
  })
})

describe('isUsable', () => {
  it('is false for no token', () => {
    expect(isUsable(null, 0)).toBe(false)
  })

  // Reconnect before the token dies, not after a poll has already failed.
  it('goes false a margin before expiry', () => {
    const token = { value: 'ya29.x', expiresAt: 1_000_000 }
    expect(isUsable(token, 1_000_000 - RENEW_MARGIN_MS - 1)).toBe(true)
    expect(isUsable(token, 1_000_000 - RENEW_MARGIN_MS)).toBe(false)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/meet/auth.test.ts`
Expected: FAIL — `Failed to resolve import "./auth"`.

- [ ] **Step 4: Write the module**

Create `src/meet/auth.ts`:

```ts
export const GIS_SRC = 'https://accounts.google.com/gsi/client'

/**
 * The narrowest scope that returns a participant list. It also confers
 * transcript access, which no narrower scope avoids — see the parent design's
 * disclosure. Nothing in this codebase names a transcript endpoint.
 */
export const MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.readonly'

/** Prompt for a new token this long before the old one dies. */
export const RENEW_MARGIN_MS = 60_000

export type TokenResponse = { access_token?: string; expires_in?: number; error?: string }

export type Token = { value: string; expiresAt: number }

type TokenClient = { requestAccessToken: () => void }

type Gis = {
  accounts?: {
    oauth2?: {
      initTokenClient(config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type?: string }) => void
      }): TokenClient
    }
  }
}

declare global {
  interface Window {
    google?: Gis
  }
}

export function tokenOf(response: TokenResponse, now: number): Token | null {
  const value = response.access_token
  if (typeof value !== 'string' || value === '') return null
  const lifetime = typeof response.expires_in === 'number' ? response.expires_in * 1000 : 0
  return { value, expiresAt: now + lifetime }
}

export function isUsable(token: Token | null, now: number): boolean {
  return token !== null && token.expiresAt - now > RENEW_MARGIN_MS
}

/** Blank when the build was not given one, which the panel reports rather than hiding. */
export function clientId(): string {
  const configured = import.meta.env.VITE_MEET_CLIENT_ID
  return typeof configured === 'string' ? configured : ''
}

let loading: Promise<void> | null = null

export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      reject(new Error('could not load Google sign-in'))
    }
    document.head.appendChild(script)
  })
  return loading
}

/**
 * One token, one user gesture. The token model has no silent refresh, so this
 * must be called from a click — a popup blocker eats anything else.
 */
export async function requestToken(now: number): Promise<Token> {
  const id = clientId()
  if (id === '') throw new Error('this build has no Google client id')
  await loadGis()
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new Error('Google sign-in did not load')

  return new Promise<Token>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: id,
      scope: MEET_SCOPE,
      callback: (response) => {
        const token = tokenOf(response, now)
        if (token) resolve(token)
        else reject(new Error(response.error ?? 'no access token'))
      },
      error_callback: (error) => reject(new Error(error.type ?? 'sign-in failed')),
    })
    client.requestAccessToken()
  })
}
```

- [ ] **Step 5: Run the tests and the build**

Run: `npx vitest run src/meet/auth.test.ts && npm run build`
Expected: tests PASS. The build must resolve `import.meta.env` — if it does not, Step 1 did not take.

- [ ] **Step 6: Commit**

```bash
git add src/meet/auth.ts src/meet/auth.test.ts tsconfig.json
git commit -m "feat(meet): sign in with the Identity Services token model"
```

---

### Task 8: Give the hosted build a client id

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Register the OAuth client** *(console work, once, outside the repo)*

In Google Cloud console, create an OAuth 2.0 Client ID of type **Web application**. Add the Pages origin of this repo as an Authorized JavaScript origin, and `http://localhost:5173` for local work. No redirect URI is needed — the token model does not use one. Enable the Google Meet API on the project. Save the client id as a repository variable named `MEET_CLIENT_ID` (Settings → Secrets and variables → Actions → Variables). A variable, not a secret: it is not one, and a secret would be masked in logs for no benefit.

- [ ] **Step 2: Pass it to the build**

In `.github/workflows/deploy.yml`, on the build step:

```yaml
      - run: npm run build -- --base=/${{ github.event.repository.name }}/
        env:
          VITE_MEET_CLIENT_ID: ${{ vars.MEET_CLIENT_ID }}
```

- [ ] **Step 3: Document local use**

For `npm run dev`, the id comes from `.env.local`, which `.gitignore` must cover. Check `.gitignore` for `.env.local` and add it if absent. The file holds one line:

```
VITE_MEET_CLIENT_ID=<the client id>
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml .gitignore
git commit -m "ci: give the hosted build a Google client id"
```

---

### Task 9: The Meet panel

**Files:**
- Create: `src/editor/MeetPanel.tsx`, `src/editor/MeetPanel.test.tsx`
- Modify: `src/editor/Editor.css`

- [ ] **Step 1: Write the failing test**

Create `src/editor/MeetPanel.test.tsx`. Follow `FeedPanel.test.tsx` for setup style:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MeetFeedConfig } from '../feed/types'
import { MeetPanel } from './MeetPanel'

const config: MeetFeedConfig = {
  kind: 'meet',
  id: 'meet',
  defaults: { weight: 1 },
  conference: '',
  intervalMs: 5000,
}

const noop = () => {}

afterEach(() => vi.unstubAllGlobals())

describe('MeetPanel', () => {
  it('says so when the build has no client id', () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', '')
    render(<MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />)
    expect(screen.getByText(/no Google client id/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /connect/i })).not.toBeInTheDocument()
  })

  it('offers Connect and polls nothing until it is used', () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />)
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renders the roster it is given', () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
    render(
      <MeetPanel
        config={config}
        items={[{ id: 'users/1', label: 'Ana' }]}
        onItems={noop}
        onChange={noop}
      />,
    )
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  // The panel sits one window-drag from a screen share.
  it('never puts the token in the DOM', async () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }: { callback: (r: unknown) => void }) => ({
            requestAccessToken: () => callback({ access_token: 'ya29.secret', expires_in: 3600 }),
          }),
        },
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response))
    const { container } = render(
      <MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /connect/i }))
    expect(container.innerHTML).not.toContain('ya29.secret')
  })

  // Retrying a dead token every 5s spends quota and fixes nothing.
  it('stops polling and offers Connect again after a 401', async () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }: { callback: (r: unknown) => void }) => ({
            requestAccessToken: () => callback({ access_token: 'ya29.x', expires_in: 3600 }),
          }),
        },
      },
    })
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'expired' }))
    vi.stubGlobal('fetch', fetchSpy)
    render(<MeetPanel config={config} items={[]} onItems={noop} onChange={noop} />)
    await userEvent.click(screen.getByRole('button', { name: /connect/i }))

    await screen.findByText(/401/)
    const after = fetchSpy.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchSpy.mock.calls.length).toBe(after)
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeInTheDocument()
  })

  it('edits the pin and the interval through onChange', async () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
    const onChange = vi.fn()
    render(<MeetPanel config={config} items={[]} onItems={noop} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Conference'), 'abc')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ conference: expect.any(String) }))
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/editor/MeetPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./MeetPanel"`.

- [ ] **Step 3: Write the panel**

Create `src/editor/MeetPanel.tsx`. It owns the token, the poll clock, the cached conference, and the last error; the items go up to the Editor, which publishes them:

```tsx
import { PropertyPanel, PropertyRow } from '@weasel-js/labkit'
import { useEffect, useRef, useState } from 'react'
import type { FeedItem, MeetFeedConfig } from '../feed/types'
import { MeetApiError } from '../meet/api'
import { type Token, clientId, isUsable, requestToken } from '../meet/auth'
import { MIN_POLL_INTERVAL_MS } from '../meet/poll'
import { fetchRoster } from '../meet/roster'

export type MeetPanelProps = {
  config: MeetFeedConfig
  /** Who is in the conference. Never persisted: the preset stores how to get a roster, not one. */
  items: FeedItem[]
  onItems: (items: FeedItem[]) => void
  onChange: (config: MeetFeedConfig) => void
}

export function MeetPanel({ config, items, onItems, onChange }: MeetPanelProps) {
  const [token, setToken] = useState<Token | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const id = clientId()

  const connect = async () => {
    setError(null)
    try {
      setToken(await requestToken(Date.now()))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  // The tick reads the latest props without restarting the clock, which would
  // otherwise reset the period on every roster it produces.
  const latest = useRef({ config, onItems })
  latest.current = { config, onItems }

  const value = token?.value ?? null
  const period = Math.max(MIN_POLL_INTERVAL_MS, config.intervalMs)

  useEffect(() => {
    if (value === null) return

    let cancelled = false
    let timer: number | undefined
    let cached: string | null = null

    // setTimeout chained after completion, not setInterval: a stalled request
    // under an interval stacks ticks and lands rosters out of order.
    const tick = async () => {
      const { config: current, onItems: publish } = latest.current
      try {
        const snapshot = await fetchRoster(value, current.conference, cached)
        if (cancelled) return
        cached = snapshot.conference
        if (snapshot.conference === null) {
          // Publishing nothing here would clear the wheel over an ambiguity.
          setNote(
            snapshot.candidates > 1
              ? `${snapshot.candidates} conferences in progress — pin one`
              : 'nothing in progress',
          )
        } else {
          setNote(null)
          publish(snapshot.items)
        }
        setError(null)
      } catch (failure) {
        if (cancelled) return
        // The roster on screen stays. A failed poll never empties the wheel.
        setError(failure instanceof Error ? failure.message : String(failure))
        // A dead token and a denied scope do not fix themselves, and retrying
        // either every few seconds only spends quota. Anything else — a blip, a
        // 500 — is worth another go.
        if (failure instanceof MeetApiError && (failure.status === 401 || failure.status === 403)) {
          if (failure.status === 401) setToken(null)
          return
        }
      }
      if (!cancelled) timer = window.setTimeout(tick, period)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [value, period])

  // Not reactive on its own: nothing re-renders when a token merely ages. The
  // poll's own state changes drive this often enough to catch the threshold.
  const connected = isUsable(token, Date.now())

  if (id === '') {
    return (
      <PropertyPanel title="Google Meet">
        <p className="meet-panel__status">
          This build has no Google client id, so it cannot sign in.
        </p>
      </PropertyPanel>
    )
  }

  return (
    <PropertyPanel title="Google Meet">
      <PropertyRow label="Connection">
        <button type="button" onClick={connect}>
          {connected ? 'Reconnect' : 'Connect'}
        </button>
      </PropertyRow>

      <PropertyRow label="Conference">
        <input
          type="text"
          aria-label="Conference"
          value={config.conference}
          placeholder="blank = the only one in progress"
          onChange={(event) => onChange({ ...config, conference: event.target.value })}
        />
      </PropertyRow>

      <PropertyRow label="Interval (ms)">
        <input
          type="number"
          min={MIN_POLL_INTERVAL_MS}
          step={500}
          aria-label="Interval (ms)"
          value={config.intervalMs}
          onChange={(event) => {
            const ms = Number.parseInt(event.target.value, 10)
            onChange({
              ...config,
              intervalMs: Number.isFinite(ms)
                ? Math.max(MIN_POLL_INTERVAL_MS, ms)
                : MIN_POLL_INTERVAL_MS,
            })
          }}
        />
      </PropertyRow>

      <p className="meet-panel__status">
        {connected ? `polling every ${period}ms` : 'not connected'}
        {note ? ` · ${note}` : ''}
      </p>
      {error ? <p className="meet-panel__error">{error}</p> : null}

      <ul className="meet-panel__roster">
        {items.map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
    </PropertyPanel>
  )
}
```

- [ ] **Step 4: Style it**

In `src/editor/Editor.css`, after the `.feed-panel__roster li` block around line 273:

```css
.meet-panel__roster {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.meet-panel__status,
.meet-panel__error {
  margin: 0.25rem 0 0;
  font-size: 0.85em;
}

.meet-panel__error {
  color: #ff6b6b;
}
```

No inline styles.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/editor/MeetPanel.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/editor/MeetPanel.tsx src/editor/MeetPanel.test.tsx src/editor/Editor.css
git commit -m "feat(editor): add the Google Meet panel"
```

---

### Task 10: The editor publishes every feed

**Files:**
- Modify: `src/editor/Editor.tsx:41-97`, `src/editor/Editor.tsx:161-175`, `src/editor/Editor.tsx:203-207`
- Modify: `src/editor/Editor.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/editor/Editor.test.tsx` renders against `DEFAULT_PRESET` today and never seeds a custom one, so add a helper beside `resetUnlocked` (which clears storage and sets `RIG_KEY`, and must run first):

```tsx
/** Seeds storage with a preset holding one feed of each kind. */
function seedBothFeeds() {
  window.localStorage.setItem(
    PRESET_KEY,
    JSON.stringify({
      version: 4,
      name: 'standup',
      segments: [{ id: 'ana', label: 'Ana', weight: 1 }],
      feeds: [
        {
          kind: 'simulated',
          id: 'sim',
          defaults: { weight: 1 },
          pool: ['Fay'],
          autochurn: { intervalMs: 2500, targetSize: 5, volatility: 0.25 },
        },
        { kind: 'meet', id: 'meet', defaults: { weight: 1 }, conference: '', intervalMs: 5000 },
      ],
      overrides: {},
      tricks: [],
      spin: { target: { kind: 'fair' }, motion: { durationMs: 4500, turns: 6, direction: 'cw' } },
      branches: [],
    }),
  )
}
```

Then the test:

```tsx
it('renders a panel for each feed', () => {
  resetUnlocked()
  seedBothFeeds()
  vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
  render(<Editor />)
  expect(screen.getByText('Simulated meeting')).toBeInTheDocument()
  expect(screen.getByText('Google Meet')).toBeInTheDocument()
})
```

Assert on panel titles, not internals.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/editor/Editor.test.tsx -t 'each feed'`
Expected: FAIL — only the simulated panel renders.

- [ ] **Step 3: Replace the single-feed state**

In `src/editor/Editor.tsx`, replace `const [present, setPresent] = useState<string[]>([])` with per-feed records, and derive items for every feed:

```tsx
  // Who is in each simulated meeting, and who each meet feed last reported.
  // Component state, never preset state: the preset stores how to get a
  // roster, and a roster dies with the window.
  const [present, setPresent] = useState<Record<string, string[]>>({})
  const [live, setLive] = useState<Record<string, FeedItem[]>>({})

  const items = useMemo(() => {
    const record: Record<string, FeedItem[]> = {}
    for (const feed of preset.feeds) {
      record[feed.id] =
        feed.kind === 'simulated' ? itemsFor(namesOf(present, feed.id)) : itemsOf(live, feed.id)
    }
    return record
  }, [preset.feeds, present, live])
```

Add a `namesOf` helper beside `itemsOf`, guarded the same way and for the same reason:

```tsx
function namesOf(present: Record<string, string[]>, feedId: string): string[] {
  const names = present[feedId]
  return Array.isArray(names) ? names : []
}
```

- [ ] **Step 4: Publish only what changed**

`preset.feeds` is a new array on every preset edit, so the memo above recomputes on any keystroke and would republish identical rosters — a full recompose and wheel re-render in the show window for nothing. The old code dodged this by memoizing on a feed id string, which cannot work for N feeds under `useExhaustiveDependencies`. Guard the publish instead:

```tsx
function sameItems(a: FeedItem[], b: FeedItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => item.id === b[index].id && item.label === b[index].label)
  )
}
```

```tsx
  // The editor window owns the clock, so it is the window that publishes. With
  // no editor open the show window's roster freezes at whatever last arrived.
  const published = useRef<Record<string, FeedItem[]>>({})
  useEffect(() => {
    for (const [feedId, current] of Object.entries(items)) {
      if (sameItems(itemsOf(published.current, feedId), current)) continue
      published.current = { ...published.current, [feedId]: current }
      publishFeed({ feedId, items: current })
    }
  }, [items])

  // Publishing on change alone leaves a show window opened later showing
  // statics. It announces itself instead, and this answers for every feed.
  useEffect(() => {
    return subscribeFeedRequests(() => {
      for (const [feedId, current] of Object.entries(published.current)) {
        publishFeed({ feedId, items: current })
      }
    })
  }, [])
```

`itemsOf` is the existing guarded lookup at the top of the file and is reused here rather than a second helper.

- [ ] **Step 5: Render a panel per feed**

Replace the `{feed ? <FeedPanel .../> : null}` block in the left column:

```tsx
          {preset.feeds.map((feed) =>
            feed.kind === 'simulated' ? (
              <FeedPanel
                key={feed.id}
                config={feed}
                present={namesOf(present, feed.id)}
                onPresent={(names) => setPresent((current) => ({ ...current, [feed.id]: names }))}
                onChange={(next) => update({ ...preset, feeds: replaceFeed(preset.feeds, next) })}
              />
            ) : (
              <MeetPanel
                key={feed.id}
                config={feed}
                items={itemsOf(live, feed.id)}
                onItems={(next) => setLive((current) => ({ ...current, [feed.id]: next }))}
                onChange={(next) => update({ ...preset, feeds: replaceFeed(preset.feeds, next) })}
              />
            ),
          )}
```

with, beside the other helpers:

```tsx
function replaceFeed(feeds: FeedConfig[], next: FeedConfig): FeedConfig[] {
  return feeds.map((existing) => (existing.id === next.id ? next : existing))
}
```

Delete `const feed = preset.feeds[0]` and `const feedId = feed?.id`. Import `MeetPanel` and the `FeedConfig` type.

- [ ] **Step 6: Give the overrides panel every feed's items**

`OverridesPanel` takes `items={feed ? itemsOf(items, feed.id) : []}`. It becomes every feed's items, so a Meet participant can be excluded or re-labeled:

```tsx
              items={Object.values(items).flat()}
```

- [ ] **Step 7: Run everything**

Run: `npm test && npm run build && npm run check`
Expected: PASS, clean typecheck, no lint findings. The build errors listed in Task 4 Step 4 should all be gone; anything left is a site this task missed.

- [ ] **Step 8: Commit**

```bash
git add src/editor/Editor.tsx src/editor/Editor.test.tsx
git commit -m "feat(editor): publish every configured feed"
```

---

### Task 11: Add and remove a Meet feed

**Files:**
- Modify: `src/editor/Editor.tsx`
- Modify: `src/editor/Editor.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('adds a meet feed, and offers it only once', async () => {
  resetUnlocked()
  vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
  // DEFAULT_PRESET has the simulated feed and no meet feed.
  render(<Editor />)
  expect(screen.queryByText('Google Meet')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /add google meet/i }))

  expect(screen.getByText('Google Meet')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /add google meet/i })).not.toBeInTheDocument()
  expect(parsePreset(window.localStorage.getItem(PRESET_KEY)).feeds).toHaveLength(2)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/editor/Editor.test.tsx -t 'adds a meet feed'`
Expected: FAIL — no such button.

- [ ] **Step 3: Add the control**

Below the feed panels in the left column:

```tsx
          {preset.feeds.some((feed) => feed.kind === 'meet') ? null : (
            <button
              type="button"
              className="editor__add-feed"
              onClick={() =>
                update({
                  ...preset,
                  feeds: [
                    ...preset.feeds,
                    {
                      kind: 'meet',
                      id: 'meet',
                      defaults: { weight: 1 },
                      conference: '',
                      intervalMs: 5000,
                    },
                  ],
                })
              }
            >
              Add Google Meet
            </button>
          )}
```

One meet feed at a time: the id is fixed at `meet`, and `readFeeds` drops a duplicate id anyway. Removing one is the existing preset import/export path — no delete button, until there is a reason for two.

- [ ] **Step 4: Style the button**

Add an `.editor__add-feed` rule to `src/editor/Editor.css` matching the panel buttons around it.

- [ ] **Step 5: Run everything**

Run: `npm test && npm run check`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add src/editor/Editor.tsx src/editor/Editor.test.tsx src/editor/Editor.css
git commit -m "feat(editor): add a Google Meet feed from the editor"
```

---

### Task 12: Verify against a real meeting

Automated tests cover none of the three things that actually decide whether this works: Google's consent screen, the real API's shape, and roster propagation delay.

- [ ] **Step 1: Build and serve locally**

```bash
npm run build && npm run preview
```

- [ ] **Step 2: Start a Meet conference** from the same Google account, with a second participant if one is available.

- [ ] **Step 3: Connect.** Open the editor, click Add Google Meet, then Connect. Expected: Google's consent screen names only the Meet scope, and the panel switches to `polling every 5000ms`.

- [ ] **Step 4: Watch the roster.** Expected: participants appear as wedges within a poll or two. Open the show page in a second window and confirm the same wedges arrive there.

- [ ] **Step 5: Time a join.** Have someone join and leave. Note how many seconds pass before the wheel changes — this is the propagation delay the probe never measured. Record it in the spec's opening section, replacing the sentence that says it is unmeasured.

- [ ] **Step 6: Break it on purpose.** Kill the network for one poll. Expected: the roster stays on the wheel, an error appears in the panel, and polling recovers on its own when the network returns.

- [ ] **Step 7: Exclude someone.** Give a participant an `excluded` override and confirm the wedge disappears and stays gone across a rejoin.

- [ ] **Step 8: Commit the measurement**

```bash
git add docs/superpowers/specs/2026-08-14-meet-feed-adapter-design.md
git commit -m "docs: record the measured Meet roster propagation delay"
```

---

## Notes for whoever executes this

**Tasks 1-3 are pure refactors** and must leave every existing test green without editing it, except the probe's identity expectations in Task 3 Step 5 — that change is the point of the task.

**Task 4 deliberately leaves the build broken.** Widening `FeedConfig` is what surfaces the single-feed assumptions; the list of errors it produces is the checklist for Task 10.

**The invariant to protect:** only a successful poll replaces the roster. If a test or a refactor makes a failed request clear the wheel, that is a regression regardless of what else it fixes.

**Do not persist the token or the roster.** Neither goes in localStorage, in the preset, or on the bus.
