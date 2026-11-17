# Ubaa staging/demo server

This guide covers one Linux server running Docker. It runs Postgres, the API, and the web app behind Caddy, which serves HTTPS and renews the certificate automatically. This is a **staging/demo** setup. The production hosting decision is still deferred (CLAUDE.md §12).

## What runs where

| Service | What it does |
|---|---|
| `db` | Postgres 16. Data is kept in the `db_data` volume. |
| `api` | The NestJS API in cloud (multi-tenant) mode. On every start it applies the public schema and tenant migrations, seeds the plans, and then starts the server. Attachments and images are stored in the `storage` volume. |
| `web` | Caddy. It serves the built web app at `/`, proxies `/api/*` to the API, and handles HTTPS for `$DOMAIN`. |

## First deploy

These steps run on the server.

1. **Point the domain at the server.** Add a DNS `A` record for the subdomain that points to the server's IP. The example below uses `demo.example.com`.
2. **Open the web ports.** Ports 80 and 443 must be free and open. If another web server already uses them (nginx, another Caddy), see the next section.
3. **Get the code and set the secrets:**
   ```sh
   git clone https://github.com/Mahmoud-Elmaghraby/UbaaERP.git ubaa && cd ubaa
   cp deploy/demo/.env.example deploy/demo/.env
   nano deploy/demo/.env
   ```
   In `.env`, set `DOMAIN` and every secret. Generate each secret with `openssl rand -hex 32`. `SECRETS_ENCRYPTION_KEY` is the exception: generate it with `openssl rand -base64 32`.
4. **Build and start the stack:**
   ```sh
   docker compose -f deploy/demo/docker-compose.yml --env-file deploy/demo/.env up -d --build
   docker compose -f deploy/demo/docker-compose.yml logs -f api
   ```
   Wait until the API log shows `Nest application successfully started`.
5. **Create the demo company:**
   ```sh
   docker compose -f deploy/demo/docker-compose.yml exec api \
     node dist/database/demo/demo-seed.command.js --api http://localhost:4000
   ```
   This takes about 15–20 minutes. It stops if the tenant already exists.
6. **Log in.** Open `https://$DOMAIN` and enter:
   - company code (معرّف المنشأة): `alomda`
   - email: `owner@alomda.demo`
   - password: `Demo@2026`

## If ports 80/443 are already taken (existing nginx)

Run Caddy on a local port with plain HTTP and let nginx handle TLS. Add these to `.env`:

```sh
SITE_ADDRESS=:80
WEB_HTTP_BIND=127.0.0.1:8090
WEB_HTTPS_BIND=127.0.0.1:8453
```

Then add the nginx site and a certificate:

```sh
cp deploy/demo/nginx-site.conf /etc/nginx/sites-available/ubaa.tcronix.com   # edit server_name
ln -s /etc/nginx/sites-available/ubaa.tcronix.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d ubaa.tcronix.com
```

Caddy still strips `/api` and rewrites the refresh-cookie path, so nginx only proxies `/` to `127.0.0.1:8090`.

## Updating

```sh
git pull
docker compose -f deploy/demo/docker-compose.yml --env-file deploy/demo/.env up -d --build
```

Migrations run automatically on start.

## Backups

The demo data lives in the `ubaa-demo_db_data` volume. To take a dump:

```sh
docker compose -f deploy/demo/docker-compose.yml exec db pg_dump -U ubaa ubaa > ubaa-$(date +%F).sql
```
