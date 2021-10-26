FROM bitnami/symfony

ENV PORT=80

COPY run.sh /
COPY src ./src
COPY templates ./templates

EXPOSE $PORT
