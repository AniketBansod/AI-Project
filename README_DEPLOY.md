# Deployment (VM: 4.187.225.54)

This repo includes Dockerfiles, Caddy config, and a GitHub Actions workflow to build and deploy three services:

- api (Node/Express)
- worker (BullMQ)
- ai (FastAPI)

## Prerequisites on the VM

- Ubuntu 22.04 with Docker & Docker Compose
- Open ports 80 and 443 (HTTP/HTTPS)

## DNS via nip.io

Public API base: https://api.4.187.225.54.nip.io

## First-time VM setup (manual)

- Create folders and bring up compose after first CI run:

```
ssh -i key.pem azureuser@4.187.225.54
mkdir -p ~/app
cd ~/app
# docker-compose.yml and Caddyfile will be uploaded by CI
docker login ghcr.io -u <user> -p <token>
docker compose pull
docker compose up -d
```

## Configure Secrets

In GitHub repo settings:

- GHCR_USERNAME
- GHCR_TOKEN (Classic PAT with read:packages, write:packages)
- SSH_USER (azureuser)
- SSH_KEY (private key contents for the VM)

## Frontend

Set NEXT_PUBLIC_API_URL on Vercel to https://api.4.187.225.54.nip.io
Also rotate Google OAuth authorized redirect URI to:
https://api.4.187.225.54.nip.io/auth/google/callback
