# Bora Mapear numa imagem só: API + interface compilada, porta 3737.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORTA=3737 \
    BORA_DB=/app/data/bora.db

# Dependências primeiro, para o cache das camadas.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/agentes/package.json packages/agentes/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --include=dev

COPY . .
RUN npm run build

VOLUME ["/app/data"]
EXPOSE 3737
CMD ["npm", "start"]
