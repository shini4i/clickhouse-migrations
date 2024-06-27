ARG VERSION

FROM node:22-alpine

RUN npm install --global @shini4i/clickhouse-migrations@${VERSION}
