FROM cloudron/node-base:24-20260920@sha256:d984683ec59bf2379130bf41cf3c2b6bc0453f327297d7183525cb05424e7b34 as base

RUN mkdir -p /app/code
WORKDIR /app/code

# CUBBY_COMMIT is a reference for renovate when building from main. The pipeline always builds from the branch it is run on
# renovate: datasource=git-refs packageName=https://git.cloudron.io/s42/cubby branch=main
ARG CUBBY_COMMIT=b255cfc205d103d54ffdf0629f69f118fdb7c96a

RUN export LANG=en_US.UTF-8
RUN locale-gen en_US.UTF-8
RUN update-locale LANG=en_US.UTF-8

# maybe check https://www.recoll.org/pages/features.html#doctypes.pdf also
RUN apt-get update && \
    apt-get install -y recollcmd recoll libwpd-tools poppler-utils unrtf untex wv pdftk antiword fonts-nanum libwpd-tools djvulibre-bin \
    python3-chardet python3-py7zr python3-chm python3-icalendar python3-lxml python3-mido python3-mutagen python3-rarfile && \
    rm -r /var/cache/apt /var/lib/apt/lists

COPY app.js package.json package-lock.json start.sh /app/code/
COPY skeleton /app/code/skeleton
COPY backend /app/code/backend
COPY scripts /app/code/scripts

RUN npm install --no-update-notifier --no-audit --no-fund --omit dev

FROM base AS frontend

COPY frontend /app/code/frontend

WORKDIR /app/code/frontend
RUN npm install --no-audit --no-fund --no-update-notifier
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

FROM base AS final

COPY --from=frontend /app/code/frontend-dist ./frontend-dist
COPY start.sh /app/code/

WORKDIR /app/code

CMD [ "/app/code/start.sh" ]
