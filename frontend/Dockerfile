# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . ./
# The API is exposed through the reverse proxy on the same public origin.
ARG NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build && cp -r public .next/standalone/ && mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
