FROM cloudron/base:5.1.0@sha256:1c0666c9abe9e2090d33686826d4e97769b799124573118d41e0d7485135748e as base
ENV PATH=/usr/local/node-24.19.0/bin:$PATH

RUN mkdir -p /app/code
WORKDIR /app/code

# CUBBY_COMMIT is a reference for renovate when building from main. The pipeline always builds from the branch it is run on
# renovate: datasource=git-refs packageName=https://git.cloudron.io/apps/cubby branch=main
ARG CUBBY_COMMIT=56b1426624075685f8993dec5f7197fe0cbee5ef

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

WORKDIR /app/code

CMD [ "/app/code/start.sh" ]
