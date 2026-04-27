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

ARG GIT_SHA=unknown
ARG GIT_REF=unknown
ARG BUILD_TIME=unknown
ARG REPO_URL=https://github.com/kylecaulfield/LAN-party-voting-machine
ENV GIT_SHA=${GIT_SHA}
ENV GIT_REF=${GIT_REF}
ENV BUILD_TIME=${BUILD_TIME}
ENV REPO_URL=${REPO_URL}

LABEL org.opencontainers.image.source=${REPO_URL}
LABEL org.opencontainers.image.revision=${GIT_SHA}
LABEL org.opencontainers.image.created=${BUILD_TIME}
LABEL org.opencontainers.image.ref.name=${GIT_REF}

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
