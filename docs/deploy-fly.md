# Deploy on Fly.io

Leroa ships a `fly.toml` that builds the `Dockerfile` and scales to zero when idle — roughly a dollar or two a month on `shared-cpu` with 512 MB.

1. Install [flyctl](https://fly.io/docs/flyctl/install/) and run `fly launch` from the repo root. If the app name `leroa` is taken, pick another.
2. Add Postgres. Easiest is a free [Neon](https://neon.tech) database — copy its `postgres://` URL.
3. Set secrets:

   ```sh
   fly secrets set DATABASE_URL="postgres://…" BETTER_AUTH_SECRET="$(openssl rand -hex 32)" ORIGIN="https://<app>.fly.dev"
   ```

4. `fly deploy`. Migrations run automatically on start.

Rent posting, late fees and reminders run whenever someone opens Leroa. To run them on time every day, set `CRON_SECRET` as a secret too and hit `GET /api/cron` daily with `Authorization: Bearer $CRON_SECRET` from any scheduler.
