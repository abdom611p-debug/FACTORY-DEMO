#!/usr/bin/env bash
# Self-signed HTTPS certificate for testing the phone camera on the local network.
# Phones only allow the camera on HTTPS; the first visit shows a warning → "Advanced" → "Proceed".
# usage: bash scripts/make-local-cert.sh   (then restart: node server/server.js)
set -e
cd "$(dirname "$0")/.."
mkdir -p .certs
IPS=$(node -e "console.log(Object.values(require('os').networkInterfaces()).flat().filter(i=>i&&i.family==='IPv4'&&!i.internal).map(i=>'IP:'+i.address).join(','))")
SAN="DNS:localhost,IP:127.0.0.1${IPS:+,$IPS}"
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
  -keyout .certs/key.pem -out .certs/cert.pem -subj "/CN=EGIC local" -addext "subjectAltName=$SAN" 2>/dev/null
echo "certificate for: $SAN  →  .certs/"
