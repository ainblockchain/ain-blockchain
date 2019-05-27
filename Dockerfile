# apt-get install docker.io
# RUN: sudo docker run -e LOG=true -e STAKE=250 -e TRACKER_IP="ws://34.97.217.60:3001" --network="host" -d comcom/blockchain-database:v1
# BUILD: sudo docker build -t comcom/blockchain-database:v1 .
FROM node:10.14
WORKDIR /app
COPY package.json /app
RUN npm install
COPY . /app
EXPOSE 8080 5001
CMD node client/index.js
