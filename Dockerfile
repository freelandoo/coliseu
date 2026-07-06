# Dockerfile de desenvolvimento — roda `next dev` com hot reload.
FROM node:22-alpine

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
