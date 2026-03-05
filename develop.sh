#!/bin/bash

set -eu

HELP_MESSAGE="
This script allows easier local development with a dockerized database

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

# create the same postgres server version to test with
export CONTAINER_NAME="postgres-server-cubby"

export POSTGRESQL_USERNAME="postgres"
export POSTGRESQL_PASSWORD="password"
export POSTGRESQL_DATABASE="cubby"
export POSTGRESQL_PORT=5432

if [[ "${fresh}" == "true" ]]; then
    echo "=> Removing postgres container ${CONTAINER_NAME} if exists..."
    docker rm -f ${CONTAINER_NAME} || true

    echo "=> Purge frontend build at frontend-dist/"
    rm -rf frontend-dist
fi

OUT=`docker inspect ${CONTAINER_NAME}` 2>/dev/null || true
if [[ "${OUT}" = "[]" || -z "${OUT}" ]]; then
    echo "=> Starting ${CONTAINER_NAME} (port ${POSTGRESQL_PORT} published to host)..."
    docker run --name ${CONTAINER_NAME} -e POSTGRES_PASSWORD=${POSTGRESQL_PASSWORD} -p ${POSTGRESQL_PORT}:5432 -d postgres:12
else
    echo "=> ${CONTAINER_NAME} already created, just restarting. If you want to start fresh, run 'docker rm --force ${CONTAINER_NAME}'"
    docker restart ${CONTAINER_NAME}
fi

# Use localhost so the host (and tools like psql) can connect via the published port
export POSTGRESQL_HOST="127.0.0.1"

export PGPASSWORD="${POSTGRESQL_PASSWORD}"
echo "=> Waiting for postgres server to be ready..."
while ! docker exec ${CONTAINER_NAME} psql -U ${POSTGRESQL_USERNAME} -c "SELECT 1" >/dev/null 2>&1; do
    sleep 1
done

echo "=> Ensure database"
docker exec --env PGPASSWORD="${POSTGRESQL_PASSWORD}" ${CONTAINER_NAME}  psql -U ${POSTGRESQL_USERNAME} -tc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRESQL_DATABASE}'" | grep -q 1 || \
    docker exec --env PGPASSWORD="${POSTGRESQL_PASSWORD}" ${CONTAINER_NAME}  psql -U ${POSTGRESQL_USERNAME} -c "CREATE DATABASE ${POSTGRESQL_DATABASE}"
DATABASE_URL="postgres://${POSTGRESQL_USERNAME}:${POSTGRESQL_PASSWORD}@${POSTGRESQL_HOST}/${POSTGRESQL_DATABASE}" node ./node_modules/.bin/db-migrate up

# clear skeleton user
docker exec --env PGPASSWORD="${POSTGRESQL_PASSWORD}" ${CONTAINER_NAME} psql -U ${POSTGRESQL_USERNAME} -d ${POSTGRESQL_DATABASE} -c "DELETE FROM users WHERE username = 'skeleton'"

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
echo " > VITE_API_ORIGIN=http://localhost:3000 npm run dev"
echo ""
echo ""


echo ""
echo "┌────────────────────────────────────────────────────────────┐"
echo "| Postgres connection (no local psql required)               |"
echo "└────────────────────────────────────────────────────────────┘"
echo " > docker exec -it ${CONTAINER_NAME} psql -U ${POSTGRESQL_USERNAME} -d ${POSTGRESQL_DATABASE}"
echo "   Or with local psql: PGPASSWORD=... psql -h ${POSTGRESQL_HOST} -U ${POSTGRESQL_USERNAME} -d ${POSTGRESQL_DATABASE}"
echo ""

# for up/down testing
# DATABASE_URL="postgres://${POSTGRESQL_USERNAME}:${POSTGRESQL_PASSWORD}@${POSTGRESQL_HOST}/${POSTGRESQL_DATABASE}" ./node_modules/.bin/db-migrate down

export DEBUG="cubby*"
export VITE_DEV_PORT=3000
export APP_ORIGIN="http://localhost:3000"

# Use 5555 if live frontend development is run in parallel
export VITE_DEV_PORT=5555

echo "=> Start cubby"
./app.js
