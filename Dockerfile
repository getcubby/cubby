FROM cloudron/base:4.2.0@sha256:46da2fffb36353ef714f97ae8e962bd2c212ca091108d768ba473078319a47f4

RUN mkdir -p /app/code
WORKDIR /app/code

COPY . /app/code

RUN npm install
RUN npm run build

CMD [ "/app/code/start.sh" ]
