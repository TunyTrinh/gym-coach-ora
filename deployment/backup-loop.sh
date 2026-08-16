#!/bin/sh
set -eu
: "${MYSQL_HOST:=db}"
: "${BACKUP_INTERVAL_HOURS:=24}"
: "${BACKUP_RETENTION_DAYS:=14}"
mkdir -p /backups

backup_database() {
  timestamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
  destination="/backups/gymflow-${timestamp}.sql.gz"
  echo "[backup] writing ${destination}"
  mysqldump --host="$MYSQL_HOST" --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" --single-transaction --routines --events --set-gtid-purged=OFF "$MYSQL_DATABASE" | gzip -9 > "$destination"
  find /backups -type f -name 'gymflow-*.sql.gz' -mtime +"$BACKUP_RETENTION_DAYS" -delete
}

while true; do
  backup_database || echo "[backup] database dump failed; retrying at the next interval"
  sleep "$((BACKUP_INTERVAL_HOURS * 3600))"
done
