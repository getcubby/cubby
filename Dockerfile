FROM cloudron/base:4.2.0@sha256:46da2fffb36353ef714f97ae8e962bd2c212ca091108d768ba473078319a47f4

ENV CLOUDRON_POSTGRESQL_USERNAME="postgres" \
    CLOUDRON_POSTGRESQL_PASSWORD="password" \
    CLOUDRON_POSTGRESQL_DATABASE="cubby" \
    CLOUDRON_POSTGRESQL_PORT=5432 \
    CONTAINER_NAME="postgres-server-cubby" \
    CLOUDRON_POSTGRESQL_HOST="postgres-server-cubby" \
    PGPASSWORD="${CLOUDRON_POSTGRESQL_PASSWORD}" \
    DEBUG="cubby*"

RUN mkdir -p /app/code \
    && mkdir /app/data

WORKDIR /app/code

COPY . /app/code

RUN npm install
RUN npm run build

# for development
# RUN ./node_modules/.bin/vite build --sourcemap=inline

CMD [ "/app/code/start.sh" ]

