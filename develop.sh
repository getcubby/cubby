#!/bin/bash

set -eu

HELP_MESSAGE="
This script allows easier local development with a dockerized database

 Options:
   --fresh         Start with a fresh database
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
CONTAINER_NAME="postgres-server-cubby"

export POSTGRESQL_USERNAME="postgres"
export POSTGRESQL_PASSWORD="password"
export POSTGRESQL_DATABASE="cubby"
export POSTGRESQL_PORT=5432

if [[ "${fresh}" == "true" ]]; then
    echo "=> Removing postgres container ${CONTAINER_NAME} if exists..."
    docker rm -f ${CONTAINER_NAME} || true
fi

OUT=`docker inspect ${CONTAINER_NAME}` || true
if [[ "${OUT}" = "[]" ]]; then
    echo "=> Starting ${CONTAINER_NAME}..."
    docker run --name ${CONTAINER_NAME} -e POSTGRES_PASSWORD=${POSTGRESQL_PASSWORD} -d postgres:12
else
    echo "=> ${CONTAINER_NAME} already created, just restarting. If you want to start fresh, run 'docker rm --force ${CONTAINER_NAME}'"
    docker restart ${CONTAINER_NAME}
fi

export POSTGRESQL_HOST=`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${CONTAINER_NAME}`

export PGPASSWORD="${POSTGRESQL_PASSWORD}"
echo "=> Waiting for postgres server to be ready..."
while ! psql -h "${POSTGRESQL_HOST}" -U ${POSTGRESQL_USERNAME} -c "SELECT 1"; do
    sleep 1
done

echo "=> Ensure database"
psql -h "${POSTGRESQL_HOST}" -U ${POSTGRESQL_USERNAME} -tc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRESQL_DATABASE}'" | grep -q 1 | psql -h "${POSTGRESQL_HOST}" -U postgres -c "CREATE DATABASE ${POSTGRESQL_DATABASE}" || true

echo "========================================================================================="
echo ""
echo "If running the vite dev server as below in a second terminal on the side for live-reload"
echo ""
echo "VITE_API_ORIGIN=http://localhost:3000 npm run dev"
echo ""
echo "========================================================================================="

# for up/down testing
# DATABASE_URL="postgres://${POSTGRESQL_USERNAME}:${POSTGRESQL_PASSWORD}@${POSTGRESQL_HOST}/${POSTGRESQL_DATABASE}" ./node_modules/.bin/db-migrate down

export DEBUG="cubby*"
export VITE_DEV_PORT=5555

echo "=> Start cubby"
npm start
