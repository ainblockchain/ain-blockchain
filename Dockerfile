FROM node:20
RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*
WORKDIR /app/ain-blockchain
COPY package.json yarn.lock ./
COPY patches/ patches/
RUN yarn install
COPY . .
EXPOSE 8080 5000
ENTRYPOINT ["bash", "./start_node_docker.sh"]
