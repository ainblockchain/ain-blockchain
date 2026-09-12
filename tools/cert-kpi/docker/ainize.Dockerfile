ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv docker.io git make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/runtime && /opt/runtime/bin/pip install --no-cache-dir numpy==2.2.6 && /opt/runtime/bin/pip freeze > /opt/runtime/requirements.resolved.txt
WORKDIR /opt/ainize
COPY ainize-core ./ainize-core
COPY ainize-node ./ainize-node
COPY ainize-cli ./ainize-cli
RUN cd ainize-core && npm ci --ignore-scripts && npm run build
RUN cd ainize-node && npm ci --ignore-scripts && npm run build
RUN cd ainize-cli && npm ci --ignore-scripts && npm run build
RUN for package in ainize-core ainize-node ainize-cli; do cd /opt/ainize/$package && npm ls --all --json > dependencies.resolved.json; done
ENV PATH=/opt/runtime/bin:$PATH
ENTRYPOINT ["node"]
CMD ["/opt/ainize/ainize-node/dist/bin.js"]
