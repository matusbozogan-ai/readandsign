FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Use template so BACKEND_URL env var is substituted at container start
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
