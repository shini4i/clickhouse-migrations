ARG VERSION

FROM node:22

RUN npm install --global @shini4i/clickhouse-migrations@${VERSION}
