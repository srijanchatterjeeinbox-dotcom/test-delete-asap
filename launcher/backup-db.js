/**
 * Dr. Pandey Clinic - SQLite Online Consistent Backup
 * 
 * Uses better-sqlite3's native online backup API (sqlite3_backup_step)
 * to safely capture database state even while in WAL mode and under active writes.
 */

const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const dbFile = path.join(dataDir, 'drpandey.db');
const backupDir = path.join(dataDir, 'backups');

fs.mkdirSync(backupDir, { recursive: true });

if (!fs.existsSync(dbFile)) {
  console.log('[Backup] No existing database found to back up (first-time launch).');
  process.exit(0);
}

const Database = require('better-sqlite3');

try {
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '');
  const targetFile = path.join(backupDir, `drpandey-backup-${timestamp}.db`);

  console.log(`[Backup] Starting online backup to: ${targetFile}`);
  db.backup(targetFile)
    .then(() => {
      db.close();
      const stats = fs.statSync(targetFile);
      console.log(`[Backup] Database backup completed successfully (${stats.size} bytes).`);

      // Prune old backups, keeping the most recent 30
      try {
        const files = fs.readdirSync(backupDir)
          .filter(f => f.startsWith('drpandey-backup-') && f.endsWith('.db'))
          .map(f => ({ name: f, path: path.join(backupDir, f), mtime: fs.statSync(path.join(backupDir, f)).mtime }))
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 30) {
          const toDelete = files.slice(30);
          for (const item of toDelete) {
            fs.unlinkSync(item.path);
          }
          console.log(`[Backup] Pruned ${toDelete.length} older backup(s).`);
        }
      } catch (pruneErr) {
        console.warn('[Backup] Note on pruning:', pruneErr.message);
      }

      process.exit(0);
    })
    .catch(err => {
      db.close();
      console.error('[Backup Error] Failed to complete online backup:', err.message);
      process.exit(1);
    });
} catch (e) {
  console.error('[Backup Error]', e.message);
  process.exit(1);
}

