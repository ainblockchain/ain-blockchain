FROM node:22.14.0-bookworm-slim
WORKDIR /opt/ain-sdk
COPY client/package.json client/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
ENV NODE_PATH=/opt/ain-sdk/node_modules
ENTRYPOINT ["node"]
