# GymFlow self-hosted deployment

GymFlow runs on one machine using four containers: the same-origin PWA/API, MySQL, Caddy for HTTPS, and an isolated backup worker. The database has no host port and remains private to the internal Docker network.

## Prepare the host

Install Docker Engine with the Compose plugin, open TCP ports **80** and **443**, and point an A or AAAA record for the chosen hostname at this machine. Copy `.env.selfhost.example` to `.env`, replace every placeholder with strong values, and restrict `.env` to the deployment operator.

Create a Google OAuth web client and register `https://YOUR_DOMAIN/api/auth/google/callback` as its redirect URI. Put the client ID and secret in `.env`.

## Run and update

Start with `docker compose up -d --build`. Caddy obtains and renews HTTPS certificates once DNS and ports are correct. Check services with `docker compose ps`; inspect logs with `docker compose logs -f app caddy`.

Deploy each release with `docker compose up -d --build`. The image build stamps a new service-worker cache namespace so installed browsers load the latest PWA after deployment. Android users install from their browser menu; iPhone and iPad users install in Safari with **Share → Add to Home Screen**.

## Backups and recovery

The backup container writes a compressed database dump to `./backups` every `BACKUP_INTERVAL_HOURS` and removes files older than `BACKUP_RETENTION_DAYS`. Replicate that folder to an encrypted off-machine destination; a backup kept only on the host cannot protect against machine loss.

For recovery, start the database service, then run `gunzip -c backups/FILE.sql.gz | docker compose exec -T db mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"`. Start the full stack afterward and test restores away from production before relying on them.

