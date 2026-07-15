FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
RUN mkdir -p /data
ENV DRIFT_DATABASE_PATH=/data/drift.sqlite PORT=3000
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "dist/server.js"]
