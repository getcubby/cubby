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

FROM base AS build

# renovate: datasource=github-releases depName=storytold/gridcraft
ARG GRIDCRAFT_VERSION=0.19.1
# renovate: datasource=github-releases depName=storytold/wordcraft
ARG WORDCRAFT_VERSION=0.19.1
# renovate: datasource=github-releases depName=storytold/deckcraft
ARG DECKCRAFT_VERSION=0.19.1

COPY . /app/code

# the production build, shared with the s42 workspace image (hub scripts/build-app.sh)
RUN bash scripts/build.sh

FROM base AS final

WORKDIR /app/code

COPY --from=build /app/code/node_modules ./node_modules
COPY --from=build /app/code/frontend-dist ./frontend-dist
COPY --from=build /app/code/app.js /app/code/package.json /app/code/package-lock.json /app/code/start.sh ./
COPY --from=build /app/code/skeleton ./skeleton
COPY --from=build /app/code/backend ./backend
COPY --from=build /app/code/scripts ./scripts

CMD [ "/app/code/start.sh" ]
