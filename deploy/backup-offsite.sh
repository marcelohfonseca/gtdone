#!/usr/bin/env bash
# Copia os backups locais para outro dispositivo e valida a cópia mais recente.
# Uso: backup-offsite.sh usuario@host:/caminho/gtdone-backups   (agende via cron/systemd timer)
set -euo pipefail

DEST="${1:?informe o destino rsync, ex.: usuario@host:/srv/gtdone-backups}"
SRC="${GTDONE_BACKUP_DIR:-/var/lib/gtdone/backups}"

rsync -a --delete-after --include='gtdone-*.db' --exclude='*' "$SRC"/ "$DEST"/

latest="$(ls -1 "$SRC"/gtdone-*.db | sort | tail -n 1)"
node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[1], { readOnly: true });
const r = db.prepare('PRAGMA integrity_check').all();
if (r.length !== 1 || r[0].integrity_check !== 'ok') { console.error('integridade falhou'); process.exit(1); }
console.log('backup mais recente íntegro:', process.argv[1]);
" "$latest"
