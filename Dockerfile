FROM node:20-slim AS app

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Install all deps (incl. dev): build tools (vite, esbuild) live in
# devDependencies AND are imported at runtime by the server bundle, so a
# prod-only install would crash with "Cannot find module 'vite'".
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copy source (node_modules/dist excluded via .dockerignore) and build.
COPY . .
RUN npm run build

EXPOSE 8080
CMD ["node", "dist/index.js"]
