FROM node:22.14.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/ain-blockchain
COPY package.json yarn.lock ./
COPY patches ./patches
RUN yarn install --frozen-lockfile --non-interactive
COPY . .
ENV HOSTING_ENV=local CONSOLE_LOG=false
ENTRYPOINT ["node"]
CMD ["--max-old-space-size=8192", "client/index.js"]
