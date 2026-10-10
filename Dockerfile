FROM caddy:2-alpine
RUN apk add --no-cache unzip coreutils
COPY Caddyfile /etc/caddy/Caddyfile
COPY archive /tmp/peklo-archive
RUN cat /tmp/peklo-archive/part*.b64 | base64 -d > /tmp/peklo.zip \
 && echo "ffb012ae6889dd4c1d2d8a636b1d498fb10e10ee334e0bf6ad52ea4a824c654f  /tmp/peklo.zip" | sha256sum -c - \
 && mkdir -p /srv && unzip -q /tmp/peklo.zip -d /srv \
 && test -f /srv/index.html && test -f /srv/assets/p01_1.webp \
 && rm -rf /tmp/peklo.zip /tmp/peklo-archive
EXPOSE 8080
CMD ["caddy","run","--config","/etc/caddy/Caddyfile","--adapter","caddyfile"]
