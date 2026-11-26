#!/bin/sh
# Daily PostgreSQL backup for UNRET (support tickets, conversations, jobs, payments — everything).
#   One-off:   PGHOST=localhost PGUSER=unret PGPASSWORD=... PGDATABASE=unret ./scripts/backup-db.sh --once
#   Service:   runs in docker compose as "db-backup" (every 24 h, keeps BACKUP_KEEP_DAYS days).
#   Restore:   pg_restore --clean --if-exists -d unret backups/unret-YYYY-MM-DD-HHMM.dump
set -eu
DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP_DAYS:-30}"
mkdir -p "$DIR"
backup() {
  f="$DIR/unret-$(date -u +%Y-%m-%d-%H%M).dump"
  # Custom format: compressed, and pg_restore can bring back a single table if needed.
  if pg_dump -Fc -f "$f.tmp"; then
    mv "$f.tmp" "$f"
    echo "$(date -u +%FT%TZ) backup saved: $f ($(du -h "$f" | cut -f1))"
    find "$DIR" -name 'unret-*.dump' -type f -mtime +"$KEEP" -delete
  else
    rm -f "$f.tmp"
    echo "$(date -u +%FT%TZ) BACKUP FAILED" >&2
    return 1
  fi
}
if [ "${1:-}" = "--once" ]; then backup; exit $?; fi
while true; do
  backup || true
  sleep "${BACKUP_EVERY_SECONDS:-86400}"
done
