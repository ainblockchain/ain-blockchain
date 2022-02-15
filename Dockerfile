FROM node:16.14
WORKDIR /app
COPY . /app
RUN yarn install
EXPOSE 8080 5000
ENTRYPOINT bash ./start_node_docker.sh
