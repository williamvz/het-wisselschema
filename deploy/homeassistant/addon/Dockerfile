ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs

WORKDIR /opt/wisselschema
COPY server.mjs club.mjs ./
COPY www ./www

ENV PORT=8099 WWW_DIR=/opt/wisselschema/www DATA_DIR=/data

CMD ["node", "/opt/wisselschema/server.mjs"]
