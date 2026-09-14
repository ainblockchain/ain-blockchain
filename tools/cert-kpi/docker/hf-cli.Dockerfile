FROM ain-cert-ainize:repro-20260911-r2
RUN rm -rf /opt/ainize/ainize-cli/src /opt/ainize/ainize-cli/test /opt/ainize/ainize-cli/dist
COPY src /opt/ainize/ainize-cli/src
COPY test /opt/ainize/ainize-cli/test
COPY package.json /opt/ainize/ainize-cli/package.json
RUN cd /opt/ainize/ainize-cli && npm run build
WORKDIR /opt/ainize/ainize-cli
ENTRYPOINT ["node", "/opt/ainize/ainize-cli/dist/bin.js"]
