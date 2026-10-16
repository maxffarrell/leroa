# Deploy on any VPS

Any Linux VM that can run Docker Compose works — a ~€4/month Hetzner CX22, Oracle Cloud's always-free ARM tier, a DigitalOcean droplet, or a bare Raspberry Pi. This is the cheapest way to run Leroa short of a free tier.

1. Create a VM with Docker installed (Ubuntu 24.04 + `curl -fsSL https://get.docker.com | sh`).
2. Clone the source checkout (the Compose file builds this checkout):

   ```sh
   git clone https://github.com/maxffarrell/leroa.git
   cd leroa
   cp .env.example .env
   ```

3. Set `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD` in `.env` to separate outputs of `openssl rand -hex 32`, and `ORIGIN` to your HTTPS domain. Keep the file private and retain these values across upgrades. Then start it:

   ```sh
   docker compose up -d
   ```

   The `app` service runs migrations on start and listens on port 3000.

4. Point your domain at the VM and put a TLS reverse proxy in front — [Caddy](https://caddyserver.com) is the least work:

   ```
   your-domain.example {
       reverse_proxy localhost:3000
   }
   ```

5. Optional: set `CRON_SECRET` and schedule `GET /api/cron` daily with `Authorization: Bearer $CRON_SECRET` for rent posting, late fees and reminder emails. Add `RESEND_API_KEY` or `SMTP_URL` plus `EMAIL_FROM` to send real email.

Upgrades from a checkout: update the checkout, then `docker compose build --pull && docker compose up -d`. For existing volumes, configure the existing database password; editing `POSTGRES_PASSWORD` alone does not rotate the Postgres role. Never remove the volume as part of an upgrade or password rotation.
