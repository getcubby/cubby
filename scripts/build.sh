#!/bin/bash

# Builds the production tree in place. The Dockerfile and the s42 workspace image
# (hub scripts/build-app.sh) call this, so both build the app the same way.
# GRIDCRAFT_VERSION, WORDCRAFT_VERSION and DECKCRAFT_VERSION come from the Dockerfile ARGs.

set -eu
cd "$(dirname "$0")/.."

for craft in gridcraft wordcraft deckcraft; do
    var="$(echo "${craft}" | tr '[:lower:]' '[:upper:]')_VERSION"
    version="${!var:-}"
    if [[ -z "${version}" ]]; then
        echo "${var} is not set" >&2
        exit 1
    fi

    echo "==> Downloading ${craft} ${version}"
    curl --fail --silent --show-error --location -o "/tmp/${craft}.zip" \
        "https://github.com/storytold/${craft}/releases/download/v${version}/${craft}-web-${version}.zip"
    rm -rf "/tmp/${craft}" "frontend/public/${craft}"
    mkdir -p "frontend/public/${craft}"
    unzip -q "/tmp/${craft}.zip" -d "/tmp/${craft}"
    mv "/tmp/${craft}/${craft}-web-${version}"/* "frontend/public/${craft}/"
    rm -rf "/tmp/${craft}" "/tmp/${craft}.zip"
done

npm ci --omit=dev --no-audit --no-fund
(cd frontend && npm ci --no-audit --no-fund)
(cd frontend && NODE_OPTIONS="--max-old-space-size=4096" npm run build)
rm -rf frontend/node_modules
