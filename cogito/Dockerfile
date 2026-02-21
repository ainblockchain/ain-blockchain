FROM node:20-slim
WORKDIR /cogito
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3402
CMD ["npm", "start"]
