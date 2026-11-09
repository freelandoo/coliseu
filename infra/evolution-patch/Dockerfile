# Evolution 2.3.7 (mesmo digest que roda em produção desde 22/07/2026) com o
# patch do ack de <status> no Baileys — ver patch-status-ack.mjs.
FROM evoapicloud/evolution-api:v2.3.7@sha256:1bd8afc4a6cf48822e6cf02469aeae7bd35a12a6b616eacd1291926307f4d339

COPY patch-status-ack.mjs /tmp/patch-status-ack.mjs
RUN node /tmp/patch-status-ack.mjs /evolution/node_modules/baileys/lib/Socket/messages-recv.js \
 && node --check /evolution/node_modules/baileys/lib/Socket/messages-recv.js \
 && rm /tmp/patch-status-ack.mjs
