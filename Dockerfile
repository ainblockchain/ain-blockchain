FROM node:20
WORKDIR /app/ain-blockchain
COPY package.json yarn.lock ./
RUN yarn install
COPY . .
EXPOSE 8080 5000
ENTRYPOINT ["bash", "./start_node_docker.sh"]
