FROM ain-cert-chain:repro-20260911
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv curl util-linux && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/locust && /opt/locust/bin/pip install --no-cache-dir locust==2.46.0 && /opt/locust/bin/pip freeze > /opt/locust/requirements.resolved.txt
WORKDIR /opt/harness
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm ls --all --json > /opt/harness/dependencies.resolved.json
ENV PATH=/opt/locust/bin:$PATH NODE_PATH=/opt/harness/node_modules
ENTRYPOINT ["bash"]
