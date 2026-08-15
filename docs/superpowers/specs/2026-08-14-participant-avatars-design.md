# Participant avatars

Google profile photos for the people a Meet feed puts on the wheel: which API
supplies one, what permission it costs, and what has to change to draw it.

Audience: anyone working on `src/meet`, `src/feed`, or `src/wheel`. Builds on
`2026-08-14-meet-feed-adapter-design.md`, which is where the roster, the token,
and the poll come from.

## Two problems, one of them not an API problem

**Fetching a photo** for an account id needs a second Google API and a second
scope. **Drawing one on a wedge** needs neither: `Wheel.tsx` renders paths and
labels, and `Segment.media` is read only by the reveal overlay. Nothing on the
wheel draws an image today.

They are independent, and fetching is useful before drawing is: the reveal
already renders `media.kind === 'image'`, so the winner's face can appear at the
landing with no wheel work at all. That is the first thing to ship.

## The question this design rests on

A participant carries `signedinUser.user`, documented as `users/{user}` and
"Interoperable with Admin SDK API and People API." What is not documented is
whether `people.get` on `people/{account_id}` resolves a colleague who is *not*
in the operator's contacts. Two designs follow from the answer, so measure it
before building either — the probe already holds a token and a live roster,
which is how the poll-cost question got answered.

- **It resolves:** `people.get` per participant with `personFields=photos`.
  A handful of requests, each cached forever by account id.
- **It does not:** one `people.listDirectoryPeople` sweep with
  `readMask=names,photos`, cached and matched locally. Sync tokens make a
  refresh cheap. It pulls every profile in the organization to draw five faces,
  which is why it is the fallback rather than the first choice.

## Scope

`https://www.googleapis.com/auth/directory.readonly` — "See and download your
organization's GSuite directory" — covers both routes. It is a sensitive scope,
so an External app would face Google's verification review; this client is
Internal and skips it.

Adding a scope invalidates nothing, but the token in the operator's hand carries
only the Meet scope, so the panel has to send them through Connect again. There
is no incremental upgrade worth building for a one-hour token.

Admin SDK `users.photos.get` returns photo *bytes* rather than a URL and
normally requires an admin account. Only worth revisiting if `directory.readonly`
is refused.

## Modules

| Module | Change |
| --- | --- |
| `src/meet/faces.ts` | **New.** Photo lookup by account id, and the cache |
| `src/meet/roster.ts` | Attaches a photo to the items it returns |
| `src/feed/types.ts` | `FeedItem` gains an optional `media` |
| `src/feed/bus.ts` | `readMessage` validates the new field or drops the message |
| `src/compose/compose.ts` | Item media applies under an authored override, never over it |
| `src/editor/MeetPanel.tsx` | A toggle, because a face on a shared screen is a decision |

## The cache

Keyed by account id, in memory, never persisted — the roster's rule, for a
stronger reason. One fetch per account per window; a poll never refetches. A
miss is permanent for the session and renders as no photo, because retrying a
missing profile every five seconds spends quota to learn nothing. A 403 turns
the feature off for the session rather than failing the poll: **a photo lookup
must never cost the wheel its roster.**

## What this puts on screen

The show window is the one being screen-shared, and this puts faces on it. Names
are already there, so it widens an existing disclosure rather than opening a new
one — but it is a widening, and the toggle is why it is the operator's call.

It is also the first third-party egress on the page: photo URLs live on
`lh3.googleusercontent.com`. The parent spec defers a CSP because Pages cannot
send headers, and that deferral is cheap only while the page fetches nothing but
Google APIs it already talks to. This is the change that makes the CSP worth its
own spec.

## Drawing it on a wedge

Its own work, and its own spec. What it needs: an SVG `<image>` clipped to the
wedge, sized and placed from the arc geometry `geometry.ts` already computes, a
fallback for a load failure (the reveal's `onError` pattern), and a rule for an
arc too narrow to hold a face — which, with weights in play, is any arc.

## Tests

- `faces` — a cache hit costs no request; a miss is not retried; a 403 disables
  photos and leaves the roster alone.
- `roster` — with photos off, a poll is identical to today's.
- `bus` — an item carrying a photo survives the boundary; a malformed one is
  dropped whole, as an item with a bad label already is.
- `compose` — an authored `media` override beats a fetched photo.

`fetch` stays the only stubbed seam.

## Not in scope

- **Avatars on wedges.** Above.
- **Anonymous and phone participants.** No account id, so no photo, ever. They
  keep the name-slug identity the adapter gives them.
- **Caching photos across sessions.** Would mean persisting them, which is the
  one thing the roster rule forbids.
