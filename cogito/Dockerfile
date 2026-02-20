FROM node:20-slim
WORKDIR /cogito
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npx tsc
EXPOSE 3402
CMD ["node", "dist/server.js"]
