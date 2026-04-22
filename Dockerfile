# syntax=docker/dockerfile:1.6

# ─── Dependencies stage ────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ─── Runtime stage ─────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server.js ./
COPY public ./public

RUN addgroup -S -g 1001 nodejs \
 && adduser  -S -G nodejs -u 1001 nodejs \
 && chown -R nodejs:nodejs /app
USER nodejs

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
