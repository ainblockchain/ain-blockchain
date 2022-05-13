FROM node:16.14
WORKDIR /app/ain-blockchain
COPY . /app/ain-blockchain
RUN yarn install
EXPOSE 8080 5000
ARG SEASON
ENV SEASON=$SEASON
ENTRYPOINT bash ./start_node_docker.sh
