# Image de production du backend zanziGo
FROM node:22-alpine

WORKDIR /app

# Installer uniquement les dépendances de production (cache Docker optimisé)
COPY package*.json ./
RUN npm ci --omit=dev

# Copier le code applicatif
COPY src ./src
COPY db ./db
COPY scripts ./scripts

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "src/server.js"]
