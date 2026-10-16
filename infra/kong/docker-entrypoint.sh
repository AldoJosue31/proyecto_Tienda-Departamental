#!/bin/sh
set -eu

: "${JWT_ACCESS_SECRET:?JWT_ACCESS_SECRET must be configured}"
: "${TRUSTED_BFF_IP_KEY:?TRUSTED_BFF_IP_KEY must be configured}"
: "${CORS_ALLOWED_ORIGIN:?CORS_ALLOWED_ORIGIN must be configured}"

if [ "${#JWT_ACCESS_SECRET}" -lt 32 ]; then
  echo "JWT_ACCESS_SECRET must contain at least 32 characters." >&2
  exit 1
fi

case "$JWT_ACCESS_SECRET" in
  *[!A-Za-z0-9_-]*)
    echo "JWT_ACCESS_SECRET must use base64url-safe characters only." >&2
    exit 1
    ;;
esac

case "$TRUSTED_BFF_IP_KEY" in
  *[!A-Za-z0-9_-]*|'') echo "TRUSTED_BFF_IP_KEY must use base64url-safe characters." >&2; exit 1 ;;
esac
if [ "${#TRUSTED_BFF_IP_KEY}" -lt 43 ]; then
  echo "TRUSTED_BFF_IP_KEY must contain at least 32 random bytes encoded as base64url." >&2
  exit 1
fi

case "$CORS_ALLOWED_ORIGIN" in
  http://*|https://*) ;;
  *)
    echo "CORS_ALLOWED_ORIGIN must be an explicit http(s) origin." >&2
    exit 1
    ;;
esac

case "$CORS_ALLOWED_ORIGIN" in
  *[!A-Za-z0-9:/._-]*)
    echo "CORS_ALLOWED_ORIGIN contains unsupported characters." >&2
    exit 1
    ;;
esac

sed \
  -e "s|__JWT_ACCESS_SECRET__|$JWT_ACCESS_SECRET|g" \
  -e "s|__CORS_ALLOWED_ORIGIN__|$CORS_ALLOWED_ORIGIN|g" \
  -e "s|__TRUSTED_BFF_IP_KEY__|$TRUSTED_BFF_IP_KEY|g" \
  /usr/local/share/departamental/kong.yml.template > /tmp/kong.yml

export KONG_PLUGINS=bundled,onboarding-client-ip
export KONG_DATABASE=off
export KONG_DECLARATIVE_CONFIG=/tmp/kong.yml

exec /docker-entrypoint.sh kong docker-start
