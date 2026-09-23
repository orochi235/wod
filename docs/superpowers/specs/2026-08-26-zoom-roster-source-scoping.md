# A Zoom roster source

For whoever picks up "the meeting moved to Zoom." It answers: what in the wheel
survives the switch, what has to be built, and what could stop it outright.

Nothing here is decided. This is scoping, not a plan.

## What survives

`FeedItem` is `{ id, label }`, and the wheel, spin, banner, overrides and the
cross-window bus consume only that. `FeedConfig` is already a union on `kind`
(`simulated | meet`), so `zoom` is the shape the code expects. `simulated`
proves a second source works end to end.

## What has to be built

A twin of `src/meet/` (REST client, auth, identity mapping, one-poll roster),
a twin of `MeetPanel.tsx`, a `kind: 'zoom'` branch in `storage.ts`, and the two
`feed.kind` switches in `Editor.tsx`.

There is no adapter socket to plug into. `Feed.subscribe` in `feed/types.ts` is
declared and deliberately unimplemented — the clock lives in the editor and the
transport on the bus, because a token that expires mid-meeting cannot reach a
closure made at subscribe time. One source can be hand-wired. Two is the point
where that seam is worth cutting for real.

## Two paths, each with a catch

**Dashboard API, in the browser.** `GET /metrics/meetings/{meetingId}/participants`
returns live participants (`type` defaults to `live`). Zoom now supports public
PKCE OAuth — a client ID with no secret, for SPAs — so the token can live in the
browser exactly as the Google one does, and the app can stay a static bundle.

The catch is the scope: `dashboard_meetings:read:admin`. It is an *admin* scope on
a *Business or higher* account with the dashboard feature enabled, where Meet asks
an ordinary user for `meetings.space.readonly`. Whoever runs the wheel needs an
account admin to authorize the app, and every viewer of the roster is reading
account-wide dashboard data to do it.

**Zoom Apps SDK, in the client.** `getMeetingParticipants` needs no admin scope and
no Business plan. It returns `participantUUID`, `screenName`, `role`.

The catch is distribution and role. The wheel would run inside a Zoom panel rather
than as a URL opened in a browser and screen-shared, and the call requires host or
co-host — a non-host gets error 80003.

## Resolve before building

- **Can an admin scope be granted to a secret-less public PKCE client?** If not, the
  browser path is dead and the Dashboard API needs a backend this project has never
  had. This is the one that decides everything else.
- **Is the Zoom participant id stable across a rejoin?** Overrides key off
  `FeedItem.id` and are meant to outlive the item, so an id that changes when
  someone's wifi drops silently detaches their color and their joke. Meet's
  identity mapping is in `src/meet/identity.ts`; the Zoom twin lives or dies on
  this answer.
- **Polling or webhooks?** Zoom staff recommend webhooks for live participant
  tracking. Webhooks need a public endpoint to receive them, which a static
  GitHub Pages bundle cannot be. Polling fits the current shape; confirm the
  Dashboard endpoint's category tolerates it before committing to a cadence.

## Rate limits

Zoom's endpoint reference marks this one Heavy: 40/sec on Business+, against a
combined 60,000/day. A 5s poll making two calls a tick is roughly 11,500 requests
across an eight-hour day, which fits. Sources disagree on whether dashboard
endpoints are billed as Heavy or under a much tighter resource-intensive group
(12/min on Business+), and at 12/min a 5s poll does not fit. Measure before
choosing `DEFAULT_POLL_INTERVAL_MS` for Zoom.

## Sources

- [Public PKCE OAuth for native and client-side apps](https://developers.zoom.us/blog/public-pkce/)
- [Dashboard: list meeting participants](https://portal.apis.huit.harvard.edu/docs/ccs-zoom-api/1/routes/metrics/meetings/%7BmeetingId%7D/participants/get)
- [Zoom staff on live participants](https://devforum.zoom.us/t/how-to-get-live-participants-of-a-live-meeting-through-meeting-sdk-or-zoom-api/87764)
- [Zoom Apps SDK reference](https://appssdk.zoom.us/classes/ZoomSdk.ZoomSdk.html)
- [API rate limits](https://developers.zoom.us/docs/api/rate-limits/)
