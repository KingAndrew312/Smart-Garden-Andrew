FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY api ./api
COPY lib ./lib
COPY js ./js
COPY index.html data.html favicon.svg robots.txt sitemap.xml ./

USER node
EXPOSE 3000
CMD ["node", "api/index.js"]
