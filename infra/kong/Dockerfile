FROM kong:3.9@sha256:92035d16d7ff86b7bc12fb1d0090d29357d924238b1880f78735f3f2fea6b631

USER root
COPY kong.yml.template /usr/local/share/departamental/kong.yml.template
COPY docker-entrypoint.sh /usr/local/bin/departamental-kong-entrypoint.sh
RUN tr -d '\r' < /usr/local/bin/departamental-kong-entrypoint.sh > /usr/local/bin/departamental-kong-entrypoint.sh.normalized && mv /usr/local/bin/departamental-kong-entrypoint.sh.normalized /usr/local/bin/departamental-kong-entrypoint.sh && chmod 0555 /usr/local/bin/departamental-kong-entrypoint.sh
COPY plugins/onboarding-client-ip /usr/local/share/lua/5.1/kong/plugins/onboarding-client-ip
USER kong

ENTRYPOINT ["/usr/local/bin/departamental-kong-entrypoint.sh"]
