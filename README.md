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
