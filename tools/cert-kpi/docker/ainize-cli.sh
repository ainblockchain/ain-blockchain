#!/usr/bin/env bash
set -euo pipefail
exec docker exec ain-cert-ainize-node-1 node /opt/ainize/ainize-cli/dist/bin.js "$@"
