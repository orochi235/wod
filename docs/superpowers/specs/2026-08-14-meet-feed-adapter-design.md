# Meet feed adapter

The wheel can be fed by a simulated meeting. This spec adds the real one: a
`meet` feed that signs in to Google, polls the Meet REST API for who is in the
conference right now, and publishes them on the existing feed bus as wedges.

Audience: anyone working on `src/feed`, the editor's panels, or the probe.

This is the adapter the wedge-sources spec deferred and the parent spec
scheduled last. Both were written expecting it, so most of what it needs already
exists — the feed contract, the bus, the override overlay, and the composition
layer are unchanged by this document.

## What already answered a question

The probe (`src/probe`, `probe.html`) has been run against a live conference.
One poll cycle — `conferenceRecords.list` then
`conferenceRecords.participants.list`, in series — costs 700–1000ms. That is
request round-trip, not roster propagation delay, which remains unmeasured. No
flapping was observed, so **there is no debounce or hysteresis in this design**.
If a later run shows a rejoin blinking between polls, that is the assumption to
revisit first.

## Auth

The parent spec specified "OAuth 2.0 with PKCE, browser-only, no client secret."
That combination is not available: Google's token endpoint requires
`client_secret` for Web application clients, and PKCE does not substitute for
it. The client types that do allow PKCE without a secret accept only loopback
and custom-scheme redirects, which a page served over HTTPS cannot use.

So auth is Google Identity Services' token model — `initTokenClient` — which is
the supported browser-only path and needs no secret. It is the implicit grant,
which Google both ships and describes as insecure for single-page apps. The
exposure is a one-hour access token in a tab the operator controls, which is the
same exposure the probe already accepted.

`src/meet/auth.ts` wraps it. The client id comes from
`import.meta.env.VITE_MEET_CLIENT_ID`, injected by `deploy.yml` from a repository
variable, so it stays out of the tree and a fork gets a panel that says auth is
not configured rather than a broken button.

**The token is never persisted, never rendered, and never published.** It lives
in editor React state, exactly as the roster does, and for a stronger version of
the same reason: the editor's sibling window is the one being screen-shared.

There is no silent refresh. The token model requires a user gesture for every
token, so the panel flips to Reconnect 60 seconds before expiry rather than
waiting for the first 401 to tell it.

Setup, done once outside the repo: register a Web application OAuth client with
the Pages origin as an authorized JavaScript origin. Scope is
`meetings.space.readonly`; the parent spec's disclosure about that scope also
conferring transcript access carries over unchanged, and remains a disclosure
rather than a build gate.

## Modules

`src/probe/api.ts` and `personOf` from `src/probe/diff.ts` move to `src/meet/`.
The probe imports them from there. Two copies of the same API client would let
the tool that measures Meet drift from the code that consumes it. `rosterDiff`
stays in the probe: join and leave transitions are a probe concept, and the
wheel only ever sees snapshots. `ProbeError` is renamed `MeetApiError` on the
way, since it carries an HTTP status from Google and knows nothing about the
probe.

| Module | Holds |
| --- | --- |
| `src/meet/api.ts` | `liveConferences`, `pickConference`, `activeParticipants`, `MeetApiError` |
| `src/meet/identity.ts` | `personOf`, and the mapping from a `Person` to a `FeedItem` |
| `src/meet/auth.ts` | The GIS token client, expiry, and the reconnect threshold |
| `src/meet/roster.ts` | One poll: resolve the conference, fetch participants, return items |
| `src/editor/MeetPanel.tsx` | Connection state, conference, interval, roster, last error |

## Identity

An item id is `signedinUser.user` — a stable account id — when the participant
is signed in, and the slugified display name otherwise. Overrides are keyed by
item id, so a stable id is what lets a custom reveal authored today still be
waiting for that person next week. The participant resource name would not: it
is scoped to one conference, so every override would die with the meeting.

`slugify` and the dedupe loop move out of `simulated.ts` into
`src/feed/identity.ts` and are shared by both feeds. Signed-in participants
cannot collide, so this closes the ambiguity `simulated.ts` documents in its own
terms — that comment defers the fix until "the Meet adapter supplies" a real
participant id, and this is it. Anonymous and phone participants still fall back
to name-slugs and can still collide with each other.

The move also fixes the probe. `personOf` keys on the participant resource name
today, so a rejoin looks like a different person and the `FLAP?` detector cannot
fire. On a stable id it can.

Everyone on the roster becomes a wedge, including bots and participants with no
display name. Keeping the notetaker off the wheel is what the `excluded`
override is for, and it is authored once and persists.

## Config

```ts
export type MeetFeedConfig = FeedConfigBase & {
  kind: 'meet'
  /** Blank = the sole in-progress conference. A pin is a conferenceRecords id. */
  conference: string
  intervalMs: number
}

export type FeedConfig = SimulatedFeedConfig | MeetFeedConfig
```

`readFeeds` in `preset/storage.ts` drops any feed that is not `kind:
'simulated'` and says it does so because the union has one member. It becomes a
dispatch on `kind`, still dropping unknown kinds. `intervalMs` is floored at
`MIN_POLL_INTERVAL_MS` of 2000 wherever a clock is started, following
`MIN_CHURN_INTERVAL_MS` — at the measured round-trip a faster poll would spend
most of its period in flight.

`Feed` in `feed/types.ts` stays, marked inactive. It was reserved for this
adapter, but the clock has since moved into the editor and the transport onto
the bus; a `subscribe` that exists to be called once by a `useEffect` that
already handles teardown buys nothing, and a token that expires mid-meeting has
to reach the loop, which a closure over the starting token cannot do. So the
Meet adapter — the one thing the type was held open for — does not implement it
either, and its doc comment opens by saying that rather than describing a
contract as though something honored it. Nothing imports it and no tool will
flag it; the marker is for the next reader, who would otherwise read a declared
type as a live one.

## The poll

`setTimeout` chained after each completed tick, not `setInterval`. `FeedPanel`
can use an interval because `churn` is synchronous and cannot overlap itself; a
network call can, and a stalled request under an interval stacks ticks and lands
rosters out of order.

One request per tick. The resolved conference name is cached, so a steady state
calls only `activeParticipants`. Conferences are re-listed when there is no
conference, and on any tick returning an empty roster — an ended conference and
an empty room look identical from the participants call, and re-listing is the
only way to tell them apart. Empty rosters are rare, so this stays cheap and
corrects itself.

More than one conference in progress with no pin publishes nothing and surfaces
the same "pin one" hint the probe prints. Watching the wrong meeting produces a
plausible roster that is simply about other people.

Items publish through `publishFeed` and answer `subscribeFeedRequests`, the same
bus the simulator uses, with no special-casing. Attendee names still never reach
localStorage.

## Failure

**Only a successful poll replaces the roster.** Every failure — network blip,
401, 403, ambiguous conference, expired token — leaves the last good roster on
the wheel and reports itself in the panel. A Google outage must not make wedges
disappear mid-show.

A 401 or an expired token stops the loop and offers Reconnect. A 403 stops it
and shows the error, since a denied scope will not fix itself. The show window
is untouched by any of this: it renders what last arrived on the bus, which is
the frozen-roster degradation that already exists for a closed editor.

## The editor becomes a multi-feed publisher

This is the largest change outside `src/meet/`. `Editor.tsx` reads
`preset.feeds[0]` and hands it to `FeedPanel`, which is typed to
`SimulatedFeedConfig` — that compiles today only because the union has one
member. It becomes a map over `preset.feeds` rendering the panel matching each
`kind`, with live items keyed by feed id in the record `composeBase` already
takes.

The single-feed assumption is load-bearing in the items memo, the publish
effect, the request answer, and the panel render. The bus and `composeBase` are
already written for N feeds. A Meet feed and a simulated one can then run side by
side, which is how the adapter gets rehearsed against.

## Tests

- `identity` — signed-in takes the stable id; anonymous and phone fall back to
  slugs; collisions dedupe; the same person in two conferences keeps one id.
- `roster` — fetch stubbed: the sole conference is picked, a pin is honored, a
  resolved conference costs one request per tick, an empty roster re-lists, and
  a rejected poll leaves the previous roster intact. This last one protects the
  requirement; the rest check plumbing.
- `auth` — expiry math and the reconnect threshold against a stubbed GIS global.
- `MeetPanel` — no client id configured, no token, error surfacing, roster
  rendering, and that the token never appears in the DOM.
- `storage` — `kind: 'meet'` round-trips, unknown kinds still drop, `intervalMs`
  clamps.
- `Editor` — two feeds of different kinds render their own panels and publish
  under their own ids.

`fetch` and the GIS script are the only stubbed seams.

## Not in scope

- **The CSP and the admin pitch.** The parent spec promises an egress-restricting
  policy; Pages cannot send headers, so it would be a `<meta>` CSP constraining
  the whole app. Its own spec.
- **Debounce and hysteresis.** Nothing flapped. See the note at the top.
- **Any change to `Segment` or the wheel.** The wedge-sources constraint holds:
  the wheel has never known where a wedge came from.
