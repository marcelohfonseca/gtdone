# GTDone

GTD task and project management app. The server stores data in SQLite and is intended to run on a privately owned machine, accessed through a VPN.

## Development

```sh
npm install
npm run dev
```

The default SQLite file is `data/gtdone.db`. Override its location with `GTDONE_DB_PATH`.

## Production

The app uses SvelteKit's Node adapter. Build and start it with:

```sh
npm run build
npm start
```

The backup scheduler creates a SQLite backup when the server starts and every 24 hours while it is running. By default it stores the latest seven backups in `data/backups` next to the database.

- `GTDONE_DB_PATH`: SQLite database file path; defaults to `data/gtdone.db`.
- `GTDONE_BACKUP_DIR`: backup directory; defaults to `backups` beside the database.
- `GTDONE_BACKUP_KEEP`: number of backups to retain; defaults to `7`.

Backups should be copied to storage outside the host machine as part of the deployment's disaster-recovery plan. See [docs/OPERACAO.md](docs/OPERACAO.md) (in Portuguese) for the systemd service, VPN/HTTPS setup, login rate limiting, logs, off-site backup and restore procedure; the files are in `deploy/`.

- `GTDONE_LOG_LEVEL`: `info` (default), `warn` or `error`.
- `GTDONE_COOKIE_SECURE=1`: force the `Secure` flag on cookies (it is automatic when the request URL is https; set `ORIGIN` behind a proxy).

## Docker (optional)

Docker Compose runs the production build and keeps the SQLite database and backups in a persistent `./data-docker` directory.

```sh
cp .env.docker.example .env.docker
mkdir -p data-docker
# The container runs as UID 1000 (`node`); make the mounted directory writable:
sudo chown -R 1000:1000 data-docker
docker compose --env-file .env.docker up --build -d
```

Open [http://localhost:3000](http://localhost:3000). To stop the app, run `docker compose down`; the data in `data-docker` is preserved. To update, pull the desired Git revision and run `docker compose --env-file .env.docker up --build -d` again.

The published port is bound to `127.0.0.1` by default. For VPN-only access, keep that binding and put an HTTPS reverse proxy on the host in front of it; set `ORIGIN` in `.env.docker` to the external HTTPS URL. The documented Compose command passes it both to the build (for same-origin/CSRF checks) and to the running container (for secure cookies). Do not expose port 3000 directly to the public internet. Back up `data-docker` to another device as described in [docs/OPERACAO.md](docs/OPERACAO.md).

## Integrations (optional)

- `GTDONE_SMTP_URL` (e.g. `smtps://user:pass@smtp.example.com:465`) and `GTDONE_MAIL_FROM`: enable the periodic Focus email. Credentials stay in the environment, never in the database or exports. The schedule is configured in Preferences › Dados e integrações and uses the server's local time.
- Email capture: generate a token in Preferences, add allowed senders, and have an inbound-email service POST JSON `{from, subject, text}` (Postmark `From/Subject/TextBody` also work) to `/api/inbound-email` with `Authorization: Bearer <token>`. Behind a VPN, expose only that path to the email service.
- Import files larger than 512 kB require raising `BODY_SIZE_LIMIT` for the Node server (e.g. `BODY_SIZE_LIMIT=20M npm start`).
