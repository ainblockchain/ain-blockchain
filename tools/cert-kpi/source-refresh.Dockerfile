ARG BASE_IMAGE
FROM ${BASE_IMAGE}
WORKDIR /app/ain-blockchain
COPY package.json yarn.lock /tmp/ain-source-dependencies/
RUN cmp package.json /tmp/ain-source-dependencies/package.json \
    && cmp yarn.lock /tmp/ain-source-dependencies/yarn.lock \
    && rm -rf client common p2p node consensus db blockchain block-pool tx-pool \
      json_rpc event-handler logger tools test blockchain-configs patches
COPY . .
