#!/bin/bash

set -eu

HELP_MESSAGE="
This script allows easier local development

 Options:
   --fresh         Start fresh. Empty database and frontend build
   --help          Show this message
"

fresh="false"

args=$(getopt -o "" -l "help,fresh" -n "$0" -- "$@")
eval set -- "${args}"

while true; do
    case "$1" in
    --help) echo -e "${HELP_MESSAGE}"; exit 0;;
    --fresh) fresh="true"; shift;;
    --) break;;
    *) echo "Unknown option $1"; exit 1;;
    esac
done

if [[ "${fresh}" == "true" ]]; then
    echo "=> Removing local sqlite database at .data/cubby.db"
    rm -f .data/cubby.db

    echo "=> Purge frontend build at frontend-dist/"
    rm -rf frontend-dist
fi

fetch_craft() {
    local app="$1"
    local version="$2"
    if [[ ! -f "frontend/public/${app}/index.html" ]]; then
        echo "=> Fetch ${app} web build"
        local tmp
        tmp="$(mktemp -d)"
        wget -O "${tmp}/${app}-web-${version}.zip" "https://github.com/storytold/${app}/releases/download/v${version}/${app}-web-${version}.zip"
        unzip -q "${tmp}/${app}-web-${version}.zip" -d "${tmp}"
        mkdir -p "frontend/public/${app}"
        mv "${tmp}/${app}-web-${version}"/* "frontend/public/${app}/"
        rm -rf "${tmp}"
    fi
}

fetch_craft gridcraft 0.19.1
fetch_craft wordcraft 0.19.1
fetch_craft deckcraft 0.19.1

echo "=> Ensure frontend build"
if [[ ! -d "frontend-dist" ]]; then
    cd frontend
    npm i
    npm run build
    cd ..
fi

if [[ ! -f .env.sh ]]; then
    echo "=> Creating empty .env.sh create a new OIDC client on your Cloudron and fill the env vars"
cat << 'EOF' > .env.sh
export OIDC_ISSUER_BASE_URL=""
export OIDC_CLIENT_ID=""
export OIDC_CLIENT_SECRET=""
EOF
fi

echo "=> Using the following env"
echo ""
echo " ! Ensure OIDC client credentials are created with a callback URI of http://localhost:3000/auth/callback"
echo ""
cat .env.sh
source .env.sh

echo ""
echo "┌────────────────────────────────────────────────────────────┐"
echo "│ Frontend development                                       │"
echo "└────────────────────────────────────────────────────────────┘"
echo " Run a second terminal for hot reload frontend server:"
echo ""
echo " > cd frontend/"
echo " > npm run dev"
echo ""
echo ""

mkdir -p .data/{data,groups,thumbnails,sessions,.recoll}

export DEBUG="cubby*"
export VITE_DEV_PORT=3000
export APP_ORIGIN="http://localhost:3000"

# Use 5555 if live frontend development is run in parallel
export VITE_DEV_PORT=5555

echo "=> Start cubby"
./app.js
