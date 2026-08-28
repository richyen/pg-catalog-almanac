# -----------------------------------------------------------------------------
# Stage 1 — build the static React bundle
# -----------------------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first for better cache reuse.
COPY package.json ./
RUN npm install --no-audit --no-fund

# Copy source and pre-generated dataset.
COPY index.html vite.config.js ./
COPY src ./src

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2 — serve the bundle with nginx
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
