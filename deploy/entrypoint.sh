#!/bin/sh
# Applies migrations, seeds synthetic data in demo mode only, then starts EPI.
set -eu
node dist/cli.js migrate
if [ "${EPI_MODE:-production}" = "demo" ]; then
  node dist/cli.js seed-demo
fi
exec node dist/main.js
