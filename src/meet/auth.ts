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
