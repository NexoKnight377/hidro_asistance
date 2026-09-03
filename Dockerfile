# syntax=docker/dockerfile:1
# Build multi-stage de ASISTE·OPS (Next.js 16 + Drizzle + PostgreSQL).
#
#   docker compose build --no-cache
#   docker compose up -d
#
# Nota: el build NO requiere DATABASE_URL real; src/db/index.ts pospone la
# conexión hasta runtime (guarda por NEXT_PHASE). La URL verdadera la
# inyecta docker-compose.yml en el contenedor web.

# ---------- 1) dependencias ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# libc/openssl para binarios nativos ocasionales (pg-native no se usa, pero
# algunos paquetes opcionales los requieren en alpine)
RUN apk add --no-cache libc6-compat openssl
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- 2) build ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Se conservan devDependencies (drizzle-kit) porque el contenedor aplica el
# esquema al arrancar con `drizzle-kit push`.
RUN npm run build

# ---------- 3) runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=America/Caracas

# Instalar soporte de zona horaria (tzdata) para Alpine
RUN apk add --no-cache tzdata

COPY --from=builder /app ./

# Otorga permisos de ejecución al script de entrada
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]