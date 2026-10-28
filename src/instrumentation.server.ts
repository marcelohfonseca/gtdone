import { ensureBackupScheduler } from '#lib/server/backup-scheduler.ts';
import { getDb } from '#lib/server/db.ts';

ensureBackupScheduler(getDb());
