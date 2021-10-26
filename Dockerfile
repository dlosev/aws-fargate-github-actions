FROM bitnami/symfony

ENV PORT=80

COPY run.sh /

EXPOSE 80
