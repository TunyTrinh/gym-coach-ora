# Coachora

Coachora is a **mobile-first gym and Coach-booking Progressive Web App**. It gives Clients a short booking flow, gives Coaches continuous availability and schedule management, and gives Administrators role, assignment, and attendance controls. The same repository contains the Expo web/mobile client, Express/tRPC API, MySQL schema, PWA assets, and a self-hosted Docker Compose deployment.

> **Deployment model:** one public HTTPS domain → Caddy → Coachora app → private MySQL. The deployment Compose file also runs an automated local backup sidecar. Only Caddy exposes ports 80 and 443; the application and database remain on internal Docker networks.[1]

## Features

| Area           | Included behavior                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client booking | Browse Coach availability, choose a start time and duration, confirm or cancel bookings, view schedules and notifications, and record health measurements. |
| Coach workflow | Publish a continuous availability window, set concurrent capacity, view bookings in a calendar, manage assigned Clients, and keep private notes.           |
| Booking safety | The API rechecks time-window fit, Client conflicts, and concurrent capacity inside a database transaction before accepting a booking.                      |
| Roles          | Client, Coach, and Administrator capabilities are enforced by protected tRPC procedures and object-level checks.                                           |
| Localization   | English and Vietnamese interface catalog with persisted language preference; user-created content is not translated.                                       |
| PWA            | Installable web app with a manifest, icons, service worker, app-shell caching, and an offline fallback. API responses remain network-only.                 |
| Self-hosting   | Production image, MySQL 8.4, Caddy-managed HTTPS, migration-on-start, and scheduled compressed MySQL dumps.                                                |

## Technology

| Layer             | Implementation                                                          |
| ----------------- | ----------------------------------------------------------------------- |
| Mobile/web client | Expo SDK 54, React Native 0.81, React 19, Expo Router 6, NativeWind 4   |
| API               | Node.js 22, Express 4, tRPC 11, Zod                                     |
| Database          | MySQL 8.4-compatible database, Drizzle ORM, `mysql2`                    |
| Authentication    | Session cookie or Bearer JWT; Google OAuth is supported when configured |
| Web delivery      | Expo static web export, service worker, Caddy 2 reverse proxy           |
| Tests and quality | TypeScript, Expo ESLint, Vitest, production server build, web export    |

## Repository Layout

```text
app/                    Expo Router screens and role-aware tabs
components/             Shared mobile/web components
lib/                    Client state, i18n, availability helpers, theme, tRPC client
server/                 Express API, tRPC router, auth/session, database client
drizzle/                Drizzle schema and SQL migrations
shared/                 Shared domain types and constants
public/                 PWA manifest and browser assets
assets/images/          App, splash, favicon, and adaptive-icon assets
tests/                  Vitest regression tests
scripts/                Environment loading, type checking, and utilities
deployment/             Self-hosted backup loop
Dockerfile              Production image build
compose.yaml            App, MySQL, Caddy, and backup services
Caddyfile               HTTPS and reverse-proxy configuration
```

## Prerequisites

For local development, install Node.js 22 or later, Corepack, pnpm, and a MySQL-compatible database. The repository pins `pnpm@9.12.0` in `package.json`.[2]

For the self-hosted deployment, use a Linux server with Docker Engine, the Docker Compose plugin, a public IPv4/IPv6 address, and a DNS name that resolves to that server. Ports **80** and **443** must be reachable from the internet for Caddy to obtain and renew the HTTPS certificate.

## Clone and Install

```bash
git clone https://github.com/YOUR_ORGANIZATION/coachora.git
cd coachora

corepack enable
pnpm install --frozen-lockfile
```

If the repository has a different GitHub name or owner, substitute its actual clone URL. Do not copy `.env` files, database dumps, JWT secrets, OAuth client secrets, or generated web exports into Git.

## Local Development

### 1. Configure environment values

Create a local `.env` file for your machine. The app loader reads `.env` only when a variable is not already present in the shell, so exported environment variables take precedence.[3]

At minimum, server-backed workflows require a reachable `DATABASE_URL` and a strong `JWT_SECRET`. The following example is for a local MySQL database:

```dotenv
DATABASE_URL=mysql://coachora:local-password@127.0.0.1:3306/coachora
JWT_SECRET=replace-with-a-unique-long-random-secret
APP_ID=coachora-local
APP_BASE_URL=http://localhost:8081
```

Google sign-in is optional for local work. When you enable it, add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`, and register the same redirect URI with Google.

### 2. Create the database and apply migrations

Create the empty database and application account using your local MySQL administration method. Then export `DATABASE_URL` or place it in `.env` and run:

```bash
export DATABASE_URL='mysql://coachora:local-password@127.0.0.1:3306/coachora'
pnpm db:migrate
```

`pnpm db:migrate` runs the existing Drizzle SQL migrations. It fails if `DATABASE_URL` is absent; confirm the target before executing it.[4]

> Do not use `pnpm db:push` for a controlled production deployment. That command first generates a migration from the current schema and then runs migrations. Review and commit migration files before applying production changes.

### 3. Start the application

```bash
pnpm dev
```

This starts the Express/tRPC API in watch mode and Expo Metro for the web client. By default, Metro uses port `8081`; change it with `EXPO_PORT`. The project intentionally caps Metro to one worker and a 1 GB Node heap to reduce memory pressure in constrained environments.[2]

| Command           | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `pnpm dev`        | Start API and Expo web development server together. |
| `pnpm dev:server` | Start only the API with `tsx watch`.                |
| `pnpm dev:metro`  | Start only Expo web/Metro.                          |
| `pnpm android`    | Start the Expo Android workflow.                    |
| `pnpm ios`        | Start the Expo iOS workflow.                        |
| `pnpm qr`         | Generate a local QR helper.                         |

Open the Metro URL shown in the terminal. The API health endpoint is available at `http://localhost:3000/api/health` unless `PORT` is changed.

## Validate Before Release

Run the following from the repository root before opening a pull request or deploying a new build:

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm build:web
```

| Command          | What it checks or creates                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm check`     | Initial TypeScript check, then a lightweight local watch mode. Stop it with `Ctrl+C` when finished. |
| `pnpm lint`      | Expo ESLint validation.                                                                             |
| `pnpm test`      | Vitest regression suite.                                                                            |
| `pnpm build`     | Bundled production Express server in `dist/`.                                                       |
| `pnpm build:web` | Static Expo web/PWA export in `web/`.                                                               |

## Self-Hosted Production Deployment

The repository includes a complete Docker Compose deployment. It starts four services:

| Service  | Responsibility                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| `db`     | MySQL 8.4 database stored in the named `mysql_data` volume.                                                        |
| `app`    | Builds Coachora, applies migrations, serves the API and static PWA output on internal port 3000.                   |
| `caddy`  | Exposes ports 80/443, obtains HTTPS certificates, applies baseline security headers, and proxies traffic to `app`. |
| `backup` | Writes compressed MySQL dumps into `./backups/` and removes dumps older than the configured retention period.      |

### 1. Prepare the server

On a fresh Linux server, install Docker Engine and Docker Compose. Create a non-root deployment user, clone this repository into that user’s home directory, and point your domain’s DNS A/AAAA record to the server.

```bash
git clone https://github.com/YOUR_ORGANIZATION/coachora.git
cd coachora
cp .env.selfhost.example .env
chmod 600 .env
```

### 2. Configure `.env`

Edit `.env` with real, unique values. The template is deliberately safe to commit only as an example; the real `.env` must remain private.[5]

| Variable                |                   Required | Description                                                 |
| ----------------------- | -------------------------: | ----------------------------------------------------------- |
| `APP_DOMAIN`            |                        Yes | Public DNS hostname, for example `coachora.example.com`.    |
| `ACME_EMAIL`            |                        Yes | Contact email used by Caddy’s ACME certificate process.     |
| `MYSQL_DATABASE`        |                        Yes | Application database name.                                  |
| `MYSQL_USER`            |                        Yes | Non-root MySQL application username.                        |
| `MYSQL_PASSWORD`        |                        Yes | Long unique password for the application user.              |
| `MYSQL_ROOT_PASSWORD`   |                        Yes | Separate long unique MySQL root password.                   |
| `JWT_SECRET`            |                        Yes | Long random secret used to verify application session JWTs. |
| `APP_ID`                |                        Yes | Deployment/application identifier.                          |
| `GOOGLE_CLIENT_ID`      | If Google login is enabled | OAuth client ID.                                            |
| `GOOGLE_CLIENT_SECRET`  | If Google login is enabled | OAuth client secret.                                        |
| `BACKUP_INTERVAL_HOURS` |                Recommended | Dump interval; the template defaults to `24`.               |
| `BACKUP_RETENTION_DAYS` |                Recommended | Local dump retention; the template defaults to `14`.        |

For Google authentication, register this exact production callback URL with Google before starting the stack:

```text
https://YOUR_DOMAIN/api/auth/google/callback
```

### 3. Start the stack

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

The app container runs `pnpm db:migrate` before starting the production server. Caddy waits for the app health check and then handles TLS and traffic. Visit `https://YOUR_DOMAIN/api/health` to confirm the deployment is healthy.[1]

### 4. Install the PWA

After HTTPS is active, open `https://YOUR_DOMAIN` in a mobile browser. On iPhone/iPad, use Safari’s **Share → Add to Home Screen**. On Android, use the browser’s **Install app** or **Add to Home screen** action. The manifest declares standalone display mode and the exported service worker caches the app shell; API data still requires a network connection.[6]

## Updating a Self-Hosted Instance

Before updating, create and verify a database backup. Pull a reviewed commit, rebuild the image, and watch the application logs:

```bash
git fetch --all --prune
git checkout YOUR_REVIEWED_COMMIT_OR_TAG
docker compose up -d --build
docker compose logs -f app
```

Each application startup applies pending Drizzle migrations. Database migrations are not automatically reversible, so test them on staging or a restored copy first. The service worker build receives a fresh build identifier during the Docker image build, allowing browsers to fetch a new app shell after deployment.[7]

## Backup and Restore

The bundled `backup` service runs `mysqldump`, compresses each dump, stores it under `./backups/`, and deletes retained backups older than `BACKUP_RETENTION_DAYS`.[8] This is a useful local recovery layer, not a complete disaster-recovery strategy. Copy encrypted backups to separate storage and periodically restore one into a disposable database to prove the process works.

To list local backups:

```bash
ls -lh backups/
```

To restore, stop the application or restore into a separate database first. Use the MySQL client version that matches your server and validate the restored schema and booking data before directing traffic to it. Do not run `docker compose down -v` unless you intentionally want to remove all Docker volumes, including the primary MySQL data volume.

## Operations and Troubleshooting

| Symptom                        | Check first                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Site does not open over HTTPS  | Confirm DNS points to the server, ports 80/443 are open, then inspect `docker compose logs caddy`.                          |
| App keeps restarting           | Inspect `docker compose logs app`; common causes are a missing variable, unavailable database, or failed migration.         |
| Migration fails                | Verify `DATABASE_URL` locally or the Compose database variables in `.env`; never apply a migration to an unverified target. |
| Google login fails             | Compare Google’s registered callback URL with `https://APP_DOMAIN/api/auth/google/callback`.                                |
| Browser shows an old PWA build | Reload once online. Check Caddy and app logs, then verify that the new image was rebuilt and started.                       |
| Backup directory is empty      | Check `docker compose logs backup`, `.env` backup interval/retention values, and host write permission for `./backups/`.    |

## Contribution Guidelines

Keep Client booking, Coach availability, shared types, schema migrations, and server validation aligned. Client-side availability previews improve usability but do not replace the transactional server-side interval, capacity, and authorization checks.

Every database change should include a reviewed migration. Keep secrets, generated exports, local databases, result files, logs, and runtime tokens out of Git. Before proposing a release, run the validation commands above and verify the self-hosted stack on a non-production target.

## Implementation References

[1]: [Self-hosted Compose stack](compose.yaml) and [Caddy configuration](Caddyfile)  
[2]: [Project scripts and pinned package manager](package.json)  
[3]: [Local environment loader](scripts/load-env.js)  
[4]: [Drizzle migration configuration](drizzle.config.ts)  
[5]: [Self-hosted environment template](.env.selfhost.example)  
[6]: [PWA manifest](public/manifest.json) and [service worker](web/sw.js)  
[7]: [Production image build](Dockerfile)  
[8]: [Scheduled backup loop](deployment/backup-loop.sh)
