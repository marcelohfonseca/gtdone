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

Backups should be copied to storage outside the host machine as part of the deployment's disaster-recovery plan.

## Integrations (optional)

- `GTDONE_SMTP_URL` (e.g. `smtps://user:pass@smtp.example.com:465`) and `GTDONE_MAIL_FROM`: enable the periodic Focus email. Credentials stay in the environment, never in the database or exports. The schedule is configured in Preferences › Dados e integrações and uses the server's local time.
- Email capture: generate a token in Preferences, add allowed senders, and have an inbound-email service POST JSON `{from, subject, text}` (Postmark `From/Subject/TextBody` also work) to `/api/inbound-email` with `Authorization: Bearer <token>`. Behind a VPN, expose only that path to the email service.
- Import files larger than 512 kB require raising `BODY_SIZE_LIMIT` for the Node server (e.g. `BODY_SIZE_LIMIT=20M npm start`).

