import { ensureBackupScheduler } from '#lib/server/backup-scheduler.ts';
import { ensureDigestScheduler } from '#lib/server/digest-scheduler.ts';
import { getDb } from '#lib/server/db.ts';

ensureBackupScheduler(getDb());
ensureDigestScheduler(getDb());
