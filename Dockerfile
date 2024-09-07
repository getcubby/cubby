FROM cloudron/base:4.2.0@sha256:46da2fffb36353ef714f97ae8e962bd2c212ca091108d768ba473078319a47f4

RUN mkdir -p /app/code
WORKDIR /app/code

# build frontend into /app/code/frontend-dist and purge build assets
COPY frontend /app/code/frontend/
RUN cd /app/code/frontend && npm install && npm run build && rm -rf /app/code/frontend

# backend
COPY migrations /app/code/migrations/
COPY backend /app/code/backend/
COPY package.json package-lock.json app.js start.sh /app/code/
RUN npm install --omit dev

ENV CONFIG_FILE_PATH="/app/data/config.json"
ENV USER_DATA_PATH="/app/data/data/"
ENV GROUPS_DATA_PATH="/app/data/groups/"
ENV THUMBNAIL_PATH="/app/data/groups/"
ENV SESSION_PATH="/app/data/sessions/"
ENV SESSION_SECRET_FILE_PATH="/app/data/.session.secret"

CMD [ "/app/code/start.sh" ]
