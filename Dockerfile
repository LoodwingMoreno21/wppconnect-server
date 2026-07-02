FROM node:22.22.2-alpine AS base
WORKDIR /usr/src/wpp-server
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install build dependencies and runtime libraries for sharp
RUN apk update && \
    apk add --no-cache \
    vips \
    vips-dev \
    fftw-dev \
    gcc \
    g++ \
    make \
    libc6-compat \
    pkgconfig \
    python3 \
    && rm -rf /var/cache/apk/*

# To make sure yarn 4 uses node-modules linker
COPY .yarnrc.yml ./

# Copy only package.json to leverage Docker cache
COPY package.json ./
COPY yarn.lock ./

# Enable corepack and prepare yarn 4.14.1
RUN corepack enable && \
    corepack prepare yarn@4.14.1 --activate

# Install dependencies with immutable lockfile
RUN yarn install --immutable

FROM base AS build
WORKDIR /usr/src/wpp-server
COPY . .
RUN yarn install
RUN yarn build

FROM build AS runtime
WORKDIR /usr/src/wpp-server/

# Chromium + fonts/libs required by WhatsApp Web on Alpine
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    vips \
    fftw

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production

EXPOSE 21465
ENTRYPOINT ["node", "dist/server.js"]
