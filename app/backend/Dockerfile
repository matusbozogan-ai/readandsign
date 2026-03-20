# ---- Stage 1: Build ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Copy schema.sql to dist so it's available at runtime (__dirname = dist/)
RUN cp src/schema.sql dist/schema.sql

# ---- Stage 2: Production ----
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
