# ---- Stage 1: Build ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
# Delete lock file so npm re-resolves packages for the target platform (x64 Linux)
# instead of using ARM64-locked entries from the Mac-generated package-lock.json
RUN rm -f package-lock.json && npm install

COPY . .
RUN npm run build

# Copy schema.sql to dist so it's available at runtime (__dirname = dist/)
RUN cp src/schema.sql dist/schema.sql

# ---- Stage 2: Production ----
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN rm -f package-lock.json && npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
