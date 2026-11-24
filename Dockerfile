FROM cloudron/node-base:24-20261021@sha256:7435d8aca138ce01cfca4cd7ec05683223b8f5d7198c9abdaaefa1b6ba14b4c6 as base

RUN mkdir -p /app/code
WORKDIR /app/code

# CUBBY_COMMIT is a reference for renovate when building from main. The pipeline always builds from the branch it is run on
# renovate: datasource=git-refs packageName=https://git.cloudron.io/s42/cubby branch=main
ARG CUBBY_COMMIT=b627d0471e5c69e129bca1bba9e5a4d34506c918

RUN export LANG=en_US.UTF-8
RUN locale-gen en_US.UTF-8
RUN update-locale LANG=en_US.UTF-8

# maybe check https://www.recoll.org/pages/features.html#doctypes.pdf also
# libjson-perl is required by recoll's rclimg image filter
RUN apt-get update && \
    apt-get install -y recollcmd recoll libjson-perl libimage-exiftool-perl libwpd-tools poppler-utils unrtf untex wv pdftk antiword fonts-nanum libwpd-tools djvulibre-bin \
    python3-chardet python3-py7zr python3-chm python3-icalendar python3-lxml python3-mido python3-mutagen python3-rarfile && \
    rm -r /var/cache/apt /var/lib/apt/lists

COPY app.js package.json package-lock.json start.sh /app/code/
COPY skeleton /app/code/skeleton
COPY backend /app/code/backend
COPY scripts /app/code/scripts

RUN npm install --no-update-notifier --no-audit --no-fund --omit dev

FROM base AS frontend

# renovate: datasource=github-releases depName=storytold/gridcraft
ARG GRIDCRAFT_VERSION=0.19.1
# renovate: datasource=github-releases depName=storytold/wordcraft
ARG WORDCRAFT_VERSION=0.18.1
# renovate: datasource=github-releases depName=storytold/deckcraft
ARG DECKCRAFT_VERSION=0.18.1

COPY frontend /app/code/frontend

RUN mkdir -p /app/code/frontend/public/gridcraft /app/code/frontend/public/wordcraft /app/code/frontend/public/deckcraft && \
    cd /tmp && \
    wget https://github.com/storytold/gridcraft/releases/download/v${GRIDCRAFT_VERSION}/gridcraft-web-${GRIDCRAFT_VERSION}.zip && \
    unzip gridcraft-web-${GRIDCRAFT_VERSION}.zip -d /tmp && \
    mv /tmp/gridcraft-web-${GRIDCRAFT_VERSION}/* /app/code/frontend/public/gridcraft/ && \
    rm -rf gridcraft-web-${GRIDCRAFT_VERSION}.zip /tmp/gridcraft-web-${GRIDCRAFT_VERSION} && \
    wget https://github.com/storytold/wordcraft/releases/download/v${WORDCRAFT_VERSION}/wordcraft-web-${WORDCRAFT_VERSION}.zip && \
    unzip wordcraft-web-${WORDCRAFT_VERSION}.zip -d /tmp && \
    mv /tmp/wordcraft-web-${WORDCRAFT_VERSION}/* /app/code/frontend/public/wordcraft/ && \
    rm -rf wordcraft-web-${WORDCRAFT_VERSION}.zip /tmp/wordcraft-web-${WORDCRAFT_VERSION} && \
    wget https://github.com/storytold/deckcraft/releases/download/v${DECKCRAFT_VERSION}/deckcraft-web-${DECKCRAFT_VERSION}.zip && \
    unzip deckcraft-web-${DECKCRAFT_VERSION}.zip -d /tmp && \
    mv /tmp/deckcraft-web-${DECKCRAFT_VERSION}/* /app/code/frontend/public/deckcraft/ && \
    rm -rf deckcraft-web-${DECKCRAFT_VERSION}.zip /tmp/deckcraft-web-${DECKCRAFT_VERSION}

WORKDIR /app/code/frontend
RUN npm install --no-audit --no-fund --no-update-notifier
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

FROM base AS final

COPY --from=frontend /app/code/frontend-dist ./frontend-dist
COPY start.sh /app/code/

WORKDIR /app/code

CMD [ "/app/code/start.sh" ]
