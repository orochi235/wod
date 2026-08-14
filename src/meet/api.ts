const BASE = 'https://meet.googleapis.com/v2'

export type ConferenceRecord = {
  name: string
  startTime?: string
  endTime?: string
  space?: string
}

export type Participant = {
  name: string
  signedinUser?: { user?: string; displayName?: string }
  anonymousUser?: { displayName?: string }
  phoneUser?: { displayName?: string }
  earliestStartTime?: string
  latestEndTime?: string
}

export class MeetApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function get<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new MeetApiError(`${response.status} — ${body.slice(0, 300)}`, response.status)
  }
  return (await response.json()) as T
}

/**
 * Every in-progress conference this account is in. Scoped to the account's own
 * conferences by the API, not to the organization.
 */
export async function liveConferences(token: string): Promise<ConferenceRecord[]> {
  const filter = encodeURIComponent('end_time IS NULL')
  const data = await get<{ conferenceRecords?: ConferenceRecord[] }>(
    `conferenceRecords?filter=${filter}`,
    token,
  )
  return data.conferenceRecords ?? []
}

export function normalizePin(pin: string): string {
  return pin.trim().replace(/^conferenceRecords\//, '')
}

/** Whether a conference satisfies the pin. An empty pin is satisfied by any. */
export function matchesPin(name: string, pin: string): boolean {
  const wanted = normalizePin(pin)
  return wanted === '' || name === `conferenceRecords/${wanted}`
}

/**
 * Which conference to watch. A pin may be the full resource name or just the id;
 * without one, the sole in-progress conference — never a guess between several,
 * since watching the wrong meeting produces a plausible roster that is simply
 * about other people.
 */
export function pickConference(records: ConferenceRecord[], pin: string): ConferenceRecord | null {
  if (normalizePin(pin) !== '') {
    return records.find((record) => matchesPin(record.name, pin)) ?? null
  }
  return records.length === 1 ? records[0] : null
}

export async function activeParticipants(
  conference: string,
  token: string,
): Promise<Participant[]> {
  const filter = encodeURIComponent('latest_end_time IS NULL')
  const data = await get<{ participants?: Participant[] }>(
    `${conference}/participants?filter=${filter}`,
    token,
  )
  return data.participants ?? []
}
