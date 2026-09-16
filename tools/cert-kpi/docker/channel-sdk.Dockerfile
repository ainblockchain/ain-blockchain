FROM ain-cert-chain:repro-20260911
WORKDIR /opt/ain-js
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci --ignore-scripts --no-audit --no-fund && ./node_modules/.bin/patch-package --error-on-fail
COPY tsconfig.json jest.config.js ./
COPY src ./src
COPY __tests__ ./__tests__
RUN npm run build
ENTRYPOINT ["node"]
