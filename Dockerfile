FROM cloudron/base:5.0.0@sha256:04fd70dbd8ad6149c19de39e35718e024417c3e01dc9c6637eaf4a41ec4e596c as base

RUN mkdir -p /app/code
WORKDIR /app/code

# CUBBY_COMMIT is ignored as we always build from master but this tracks the release sha for renovate
# renovate: datasource=git-refs packageName=https://git.cloudron.io/apps/cubby branch=main
ARG CUBBY_COMMIT=2ab3487406269f6b3e57ec45ac69688534304818

RUN export LANG=en_US.UTF-8
RUN locale-gen en_US.UTF-8
RUN update-locale LANG=en_US.UTF-8

ARG NODE_VERSION=24.14.1
RUN mkdir -p /usr/local/node-$NODE_VERSION && \
    curl -L https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz | tar zxf - --strip-components 1 -C /usr/local/node-$NODE_VERSION
ENV PATH=/usr/local/node-$NODE_VERSION/bin:$PATH

# maybe check https://www.recoll.org/pages/features.html#doctypes.pdf also
RUN apt-get update && \
    apt-get install -y recollcmd recoll libwpd-tools poppler-utils unrtf untex wv pdftk antiword fonts-nanum libwpd-tools djvulibre-bin \
    python3-chardet python3-py7zr python3-chm python3-icalendar python3-lxml python3-mido python3-mutagen python3-rarfile && \
    rm -r /var/cache/apt /var/lib/apt/lists

COPY app.js package.json package-lock.json start.sh /app/code/
COPY skeleton /app/code/skeleton
COPY migrations /app/code/migrations
COPY backend /app/code/backend

RUN npm install --no-update-notifier --no-audit --no-fund --omit dev

FROM base AS frontend

COPY frontend /app/code/frontend

WORKDIR /app/code/frontend
RUN npm install --no-audit --no-fund --no-update-notifier
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

FROM base AS final

COPY --from=frontend /app/code/frontend-dist ./frontend-dist
COPY start.sh /app/code/

CMD [ "/app/code/start.sh" ]
