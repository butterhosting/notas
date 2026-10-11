#!/bin/sh
set -eu

# a `user:` in compose (the e2e stack runs as the host user) leaves nothing to set up, and no rights to do it with
if [ "$(id -u)" -ne 0 ]; then
    exec "$@"
fi

# the operator's value wins over the file, as it does for the app
root="${NOTAS_ROOT:-$(grep '^NOTAS_ROOT=' ".env.${STAGE}" | cut -d= -f2-)}"
mkdir -p "$root"
# a read-only mount inside the root cannot be chowned, and does not need to be
chown -R bun:bun "$root" 2>/dev/null || true

exec su-exec bun "$@"
