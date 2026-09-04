FROM kong:3.9

USER root
COPY kong.yml.template /usr/local/share/departamental/kong.yml.template
COPY docker-entrypoint.sh /usr/local/bin/departamental-kong-entrypoint.sh
RUN chmod 0555 /usr/local/bin/departamental-kong-entrypoint.sh
USER kong

ENTRYPOINT ["/usr/local/bin/departamental-kong-entrypoint.sh"]
