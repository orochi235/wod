/**
 * One poll costs 700-1000ms of round trip against a live conference, so a
 * shorter period spends most of itself in flight. Lives here rather than with
 * the preset parser for the reason MIN_CHURN_INTERVAL_MS does: every caller
 * that starts a clock has to honor it, and the parser is only one of them.
 */
export const MIN_POLL_INTERVAL_MS = 2000
