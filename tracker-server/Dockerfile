# apt-get install docker.io
# LOGIN: sudo docker login docker.io
# RUN: sudo docker run -e HOSTING_ENV="gcp" --network="host" -d ainblockchain/tracker-server:latest
# BUILD: sudo docker build -t  ainblockchain/tracker-server .
# PULL: sudo  docker pull ainblockchain/tracker-server
FROM node:10.14
WORKDIR /app
COPY package.json /app
RUN npm install
COPY . /app
EXPOSE 8080 5000
CMD node index.js
