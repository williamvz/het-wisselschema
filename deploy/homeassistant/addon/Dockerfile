# Home Assistant bouwt deze app zelf, op je eigen apparaat. Het basis-image
# staat hier vast: nieuwere versies van Home Assistant geven bij het bouwen
# geen BUILD_FROM meer mee. In het officiële Node-image zit Node al, dus er
# hoeft niets bij geïnstalleerd te worden.
FROM node:22-alpine

WORKDIR /opt/wisselschema
COPY server.mjs club.mjs ./
COPY www ./www

ENV PORT=8099 WWW_DIR=/opt/wisselschema/www DATA_DIR=/data

CMD ["node", "/opt/wisselschema/server.mjs"]
