# Estágio "dev" — usado pelo docker-compose local (target: dev): next dev com hot reload.
FROM node:22-alpine AS dev

WORKDIR /app

# Instala dependências primeiro (melhor cache de camadas).
COPY package.json package-lock.json ./
RUN npm ci

# Copia o restante do código (em dev, o bind mount do compose sobrepõe isto).
COPY . .

EXPOSE 3000

# --webpack: opta por sair do Turbopack (padrão no Next 16). O webpack respeita
#   WATCHPACK_POLLING, o que faz o hot reload funcionar no bind mount do Windows.
# -H 0.0.0.0 para o servidor ser acessível de fora do container.
CMD ["npm", "run", "dev", "--", "--webpack", "-H", "0.0.0.0"]

# ------------------------------------------------------------------
# Estágio de produção (último = padrão do Railway/`docker build` sem --target).
# slim (glibc) em vez de alpine: é a base recomendada pelo Prisma.
FROM node:22-slim AS prod

WORKDIR /app

# openssl: exigido pelos engines do Prisma em Debian slim.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci
COPY access-agent/package.json access-agent/package-lock.json ./access-agent/
RUN npm --prefix access-agent ci

COPY . .

# Client do Prisma antes do build; o kit da recepção antes do start
# (a rota /api/settings/agent-kit serve access-agent/dist/coliseu-agent-kit).
RUN npx prisma generate
RUN npm run make-kit
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# `next start` respeita o PORT injetado pelo host e escuta em 0.0.0.0.
# Migrations NÃO rodam aqui — ver preDeployCommand no railway.json / DEPLOY.md.
CMD ["npm", "start"]
