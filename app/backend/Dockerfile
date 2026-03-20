# ---- Stage 1: Build ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
# Remove ARM64-only devDependency that exists for Mac local dev but breaks x64 Linux builds
# then install normally — no lock file needed in Docker
RUN rm -f package-lock.json \
    && npm pkg delete devDependencies['@embedded-postgres/linux-arm64'] \
    && npm install

COPY . .
RUN npm run build

# Copy schema.sql to dist so it's available at runtime (__dirname = dist/)
RUN cp src/schema.sql dist/schema.sql

# ---- Stage 2: Production ----
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN rm -f package-lock.json \
    && npm pkg delete devDependencies['@embedded-postgres/linux-arm64'] \
    && npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
