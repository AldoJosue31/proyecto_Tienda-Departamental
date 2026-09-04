FROM kong:3.9

USER root
COPY kong.yml.template /usr/local/share/departamental/kong.yml.template
COPY docker-entrypoint.sh /usr/local/bin/departamental-kong-entrypoint.sh
RUN tr -d '\r' < /usr/local/bin/departamental-kong-entrypoint.sh > /usr/local/bin/departamental-kong-entrypoint.sh.normalized && mv /usr/local/bin/departamental-kong-entrypoint.sh.normalized /usr/local/bin/departamental-kong-entrypoint.sh && chmod 0555 /usr/local/bin/departamental-kong-entrypoint.sh
USER kong

ENTRYPOINT ["/usr/local/bin/departamental-kong-entrypoint.sh"]
