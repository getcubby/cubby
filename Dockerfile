FROM cloudron/base:4.2.0@sha256:46da2fffb36353ef714f97ae8e962bd2c212ca091108d768ba473078319a47f4

RUN mkdir -p /app/code
WORKDIR /app/code

COPY frontend /app/code/
WORKDIR /app/code/frontend
RUN npm install
RUN npm run build

COPY migrations backend package.json package-lock.json app.js start.sh /app/code/
WORKDIR /app/code
RUN npm install --omit dev

ENV CONFIG_FILE_PATH="/app/data/config.json"
ENV USER_DATA_PATH="/app/data/data/"
ENV GROUPS_DATA_PATH="/app/data/groups/"
ENV THUMBNAIL_PATH="/app/data/groups/"
ENV SESSION_PATH="/app/data/sessions/"
ENV SESSION_SECRET_FILE_PATH="/app/data/.session.secret"

CMD [ "/app/code/start.sh" ]
