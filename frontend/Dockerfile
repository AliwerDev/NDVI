FROM node:22-alpine

WORKDIR /app

# The postinstall script copies the MapLibre worker, so it must be in the image before npm ci.
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
