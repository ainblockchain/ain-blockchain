FROM node:10.14
WORKDIR /app
COPY package.json /app
RUN npm install
COPY . /app
EXPOSE 8080 5000
CMD node client/index.js
