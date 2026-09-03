FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile

# в образ едет только сам сайт: README и CLAUDE.md наружу не отдаём
COPY index.html /srv/index.html
COPY assets /srv/assets
