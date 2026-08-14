#!/bin/sh
# Prints a Meet API access token, refreshed from a stored refresh token.
#
# Credentials are read from $WOD_PROBE_ENV (default ~/.config/wod-probe.env),
# which is deliberately outside the repo and must contain:
#
#   WOD_CLIENT_ID=...
#   WOD_CLIENT_SECRET=...
#   WOD_REFRESH_TOKEN=...
#
# Mint the refresh token once via the OAuth Playground with Access type set to
# Offline, then never again — refresh tokens for an Internal app do not expire.
set -eu

ENV_FILE="${WOD_PROBE_ENV:-$HOME/.config/wod-probe.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "no credentials at $ENV_FILE — see the header of this script" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "$ENV_FILE"

for var in WOD_CLIENT_ID WOD_CLIENT_SECRET WOD_REFRESH_TOKEN; do
  eval "value=\${$var:-}"
  if [ -z "$value" ]; then
    echo "$var is not set in $ENV_FILE" >&2
    exit 1
  fi
done

response=$(curl -s https://oauth2.googleapis.com/token \
  -d client_id="$WOD_CLIENT_ID" \
  -d client_secret="$WOD_CLIENT_SECRET" \
  -d refresh_token="$WOD_REFRESH_TOKEN" \
  -d grant_type=refresh_token)

token=$(printf '%s' "$response" | jq -r '.access_token // empty')

if [ -z "$token" ]; then
  echo "no access token in response:" >&2
  printf '%s\n' "$response" >&2
  exit 1
fi

printf '%s\n' "$token"
