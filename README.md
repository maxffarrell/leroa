<div align="center">

# Leroa

**Open-source property management that's fast and easy to use.**

Properties, units, tenants, leases, rent tracking, maintenance, documents and a resident portal, in a keyboard-friendly UI. Self-host for free, or use Leroa Cloud.

Leroa is open core: the core is licensed under [MIT](LICENSE-MIT.txt), with separately licensed enterprise features. Copy [`.env.example`](.env.example) to `.env` for self-hosted setup. Report vulnerabilities privately through [SECURITY.md](SECURITY.md).

[![Deploy on Vercel](https://img.shields.io/badge/Deploy%20on-Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmaxffarrell%2Fleroa&env=DATABASE_URL,BETTER_AUTH_SECRET&envDescription=Postgres%20URL%20and%20a%2032%2B%20char%20random%20secret&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D)
[![Deploy on Railway](https://img.shields.io/badge/Deploy%20on-Railway-0B0D0E?logo=railway&logoColor=white)](https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Fmaxffarrell%2Fleroa&plugins=postgresql&envs=BETTER_AUTH_SECRET&BETTER_AUTH_SECRETDesc=32%2B+random+characters)
[![Deploy on Render](https://img.shields.io/badge/Deploy%20on-Render-46E3B7?logo=render&logoColor=black)](https://render.com/deploy?repo=https://github.com/maxffarrell/leroa)
[![Deploy on Koyeb](https://img.shields.io/badge/Deploy%20on-Koyeb-00D992?logo=koyeb&logoColor=black)](https://app.koyeb.com/deploy?name=leroa&type=git&repository=github.com/maxffarrell/leroa&branch=main&builder=dockerfile&ports=3000;http&env[BETTER_AUTH_SECRET]=&env[DATABASE_URL]=)
[![Deploy on DigitalOcean](https://img.shields.io/badge/Deploy%20on-DigitalOcean-0080FF?logo=digitalocean&logoColor=white)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/maxffarrell/leroa/tree/main)
[![Deploy on Hostinger](https://img.shields.io/badge/Deploy%20on-Hostinger-673DE6?logo=hostinger&logoColor=white)](https://www.hostinger.com/vps/docker-hosting?compose=https%3A%2F%2Fraw.githubusercontent.com%2Fmaxffarrell%2Fleroa%2Fmain%2Fdocker-compose.yml)

</div>

## Features

- **Portfolio**: properties and units, with bulk unit creation (`101-112, 201-212`)
- **Tenants & leases**: people or companies, multiple tenants per lease, move-in/out updates unit status
- **Rent**: monthly charges generated automatically, record payments in two keystrokes, overdue and partial tracking
- **Maintenance**: drag-and-drop board, priorities, vendors, requests from the resident portal
- **Documents**: drag-and-drop uploads
- **Resident portal**: balance, charges and maintenance requests for tenants
- **Command palette** (<kbd>⌘K</kbd>), `g`+key navigation, `j`/`k` lists, `c` to create
- **REST API + API keys**, signed **webhooks**, and an open **integrations** SDK
- **Basic SAML/OIDC SSO and passkeys**: included in the free self-hosted core; connect your own identity provider
- **BYOK AI**: included in the free self-hosted core; use your own API key or a compatible local model endpoint

Out of scope by design: general ledger and bookkeeping. Export payments to your accounting tool through integrations instead.

## Quick start

```sh
cp .env.example .env           # set a persistent random BETTER_AUTH_SECRET (32+ characters)
# In .env set POSTGRES_PASSWORD to `openssl rand -hex 32` output,
# and DATABASE_URL=postgres://leroa:<that-password>@localhost:5432/leroa
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
pnpm install
node --env-file=.env scripts/migrate.ts
pnpm dev
```

Open http://localhost:5173, create an account, then click **Explore with demo data**.

### Self-hosting

| Target       | How                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Docker       | Set persistent `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD` in `.env`, then `docker compose up -d`.            |
| Railway      | Button above. Uses `railway.json` + `Dockerfile` with a Postgres plugin.                                       |
| Vercel       | Button above. Uses `@sveltejs/adapter-vercel` automatically when `VERCEL=1`. Migrations run during the build.  |
| Render       | Button above. `render.yaml` provisions a Docker web service and a Postgres database.                           |
| Koyeb        | Button above. Builds the `Dockerfile`; add a Postgres (Koyeb PostgreSQL or free Neon) and set `DATABASE_URL`.  |
| DigitalOcean | Button above. `.do/deploy.template.yaml` creates the app and a dev Postgres on App Platform.                   |
| Hostinger    | Button above or [docs/deploy-hostinger.md](docs/deploy-hostinger.md) (VPS Docker Manager).                     |
| Any VPS      | [docs/deploy-vps.md](docs/deploy-vps.md) — same compose file on a ~$4 Hetzner VM or Oracle's always-free tier. |
| Fly.io       | [docs/deploy-fly.md](docs/deploy-fly.md) — `fly launch` using `fly.toml`, scales to zero when idle.            |
| PikaPods     | Not yet in their app catalog — once submitted, a `Run on PikaPods` badge goes here (~$1.50/mo managed).        |

Environment variables are documented in [`src/env.ts`](src/env.ts).

### Self-hosted SSO and AI

Basic SAML/OIDC SSO, passkeys and BYOK AI are included without an enterprise key or Cloud subscription. See [the configuration guide](docs/self-hosted-sso-ai.md). You supply your identity provider and any model-provider credentials; provider usage fees are separate. Credentials stay on the server. Public demos continue to block SSO/passkey configuration.

## Email and scheduled jobs

Leroa emails team invitations, rent reminders, overdue notices, maintenance updates and lease-expiry alerts. Turn each one on or off in **Settings → Notifications**. Set `RESEND_API_KEY` or `SMTP_URL`, plus `EMAIL_FROM`, to send them. Without either, emails are only written to the server log.

Rent posting, late fees and reminders run whenever someone opens Leroa. To run them on time every day, set `CRON_SECRET` and call `GET /api/cron` with `Authorization: Bearer $CRON_SECRET`. On Vercel, the cron in `vercel.json` does this for you. Elsewhere, use any scheduler, for example:

```sh
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://pm.example.com/api/cron
```

## Online rent payments

Tenants can pay their balance from the portal. Leroa never holds the money: the payment provider takes it, and a signed webhook records each payment, applied to the lease's oldest unpaid charges first. Turn providers on in **Settings → Payments**.

Each provider is a module in [`src/lib/server/payments`](src/lib/server/payments) implementing `PaymentProvider` (checkout, webhook verification, optional connected accounts). Webhooks arrive at `/api/payments/<provider>/webhook`.

### Stripe

Card and bank payments through Stripe Checkout.

1. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
2. In Stripe, add a webhook to `https://<your-domain>/api/payments/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `account.updated`.

Self-hosted installs take payments into the Stripe account of `STRIPE_SECRET_KEY`. A workspace can instead connect its own account through Stripe Connect. That is required on Leroa Cloud (`LEROA_CLOUD=true`). Connected-account events need a second webhook endpoint with "Listen to events on Connected accounts". Put both signing secrets in `STRIPE_WEBHOOK_SECRET`, separated by a comma.

### PayPal

PayPal balance, bank, card, Pay Later and Venmo (US), through PayPal Checkout.

1. Create a REST app in the [PayPal developer dashboard](https://developer.paypal.com/dashboard/) and set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` (`PAYPAL_ENVIRONMENT=sandbox` while testing).
2. Add a webhook to `https://<your-domain>/api/payments/paypal/webhook` for `CHECKOUT.ORDER.APPROVED` and `PAYMENT.CAPTURE.COMPLETED`, and put its ID in `PAYPAL_WEBHOOK_ID`.

Leroa captures the order when PayPal reports it approved.

### Square

Card, Apple Pay, Google Pay and Cash App Pay, through Square payment links.

1. Set `SQUARE_ACCESS_TOKEN` from the [Square developer console](https://developer.squareup.com/apps) (`SQUARE_ENVIRONMENT=sandbox` while testing). Payments go to the first active location unless you set `SQUARE_LOCATION_ID`. Leases must be in that location's currency.
2. Add a webhook subscription to `https://<your-domain>/api/payments/square/webhook` for `payment.created` and `payment.updated`, and put its signature key in `SQUARE_WEBHOOK_SIGNATURE_KEY`. Square signs the exact URL, so set `ORIGIN`.

### GoCardless

Bank payments: Instant Bank Pay for GBP and EUR, a one-off direct debit for USD, CAD, AUD, NZD, SEK and DKK.

1. Create an access token in the [GoCardless dashboard](https://manage.gocardless.com/developers) and set `GOCARDLESS_ACCESS_TOKEN` (`GOCARDLESS_ENVIRONMENT=sandbox` while testing).
2. Add a webhook endpoint for `https://<your-domain>/api/payments/gocardless/webhook` and put its secret in `GOCARDLESS_WEBHOOK_SECRET`.

Payments are recorded when GoCardless confirms them, which takes a few days for direct debits.

### Mollie

iDEAL, Bancontact, cards, SEPA and other European methods, through Mollie Checkout.

Set `MOLLIE_API_KEY` (a `test_` key while testing). Leroa sends Mollie the webhook URL with each payment, so there's nothing else to set up, but the URL must be reachable from the internet.

All four, like Bilt, use one account per install, so they're only offered on self-hosted installs for now.

### Bilt

Tenants pay with their Bilt account and earn points on rent, through [Bilt Checkout](https://developers.bilt.com/docs/). Bilt's partner API is invite-only and still a draft, so this needs Bilt partner onboarding (email checkout@bilt.com).

1. Get a client ID and secret from Bilt, and have them register `https://<your-domain>/api/payments/bilt/webhook`.
2. Set `BILT_CLIENT_ID`, `BILT_CLIENT_SECRET` and `BILT_WEBHOOK_SECRET` (and `BILT_ENVIRONMENT=staging` while testing).

Bilt is only offered on self-hosted installs and for leases in USD. Tenants must link their Bilt account first. Checkout opens in a new tab.

## Resident sign-in and Leroa Profile

**Social sign-in:** residents and staff can sign in with Google, Facebook or X. Each provider appears once you set its `*_CLIENT_ID` and `*_CLIENT_SECRET`. Register `<ORIGIN>/api/auth/callback/<google|facebook|twitter>` as the redirect URI. Sign-in is local to each install, so it never depends on an outside service. A social login whose email already has a password account isn't linked automatically: the resident signs in with their password first.

**Leroa Profile** is a resident profile that works across management companies, including self-hosted installs. It holds contact details, household, pets and rental-application basics, but never SSNs, dates of birth or screening data.

- **Run a profile service:** set `LEROA_PROFILE_HUB=true`. Residents edit their profile at `/id`, and see and revoke the sites they've shared it with.
- **Connect an install to one:** set `LEROA_PROFILE_URL` to the service's origin.
  - Applicants get **Fill from my Leroa profile** on listing pages, a one-time read whose token is revoked straight away.
  - Residents can connect their profile in the portal and choose which leases keep their contact details in sync. The daily cron and portal visits refresh it.
- **How sharing works:** OAuth 2.0 with PKCE. The install's own origin is its client ID, so there's nothing to register, and each share needs the resident's consent.
- **Unified sign-in:** installs with `LEROA_PROFILE_URL` set also show **Continue with Leroa** on the login and signup pages. Granting the `identity` scope signs the resident in with their hub account (stable subject + verified email), so one Leroa Profile works across installs and across the product suite (tredaro, freeweight).

## Public demo

Set `LEROA_DEMO=true` to run a public demo. The sign-in page gets a **Try the live demo** button that creates a private sample workspace for each visitor, with no sign-up. Demo workspaces are deleted after 24 hours. Sign-up, the REST API, API keys, webhooks, integrations, invites and uploads are turned off.

The cheapest hosting options:

- **$0:** Vercel Hobby with Neon's free Postgres. Vercel's Hobby plan is meant for non-commercial use.
- **About €4–5 a month:** the smallest Hetzner VPS running `docker compose up -d` with `LEROA_DEMO=true`, behind Cloudflare's free plan.

## API

Create a key under **Settings → API keys**, then:

```sh
curl -H "Authorization: Bearer lr_..." https://your-host/api/v1/properties
```

Each key is granted `read` or `read & write` per resource (properties, units, tenants, leases, charges, payments, tickets). Requests outside a key's permissions return `403`.

OpenAPI: `/api/v1/openapi.json`. Amounts are integer cents.

Webhooks are signed: `x-leroa-signature: sha256=<hex HMAC-SHA256 of the raw body with your signing secret>`.

## Integrations

Integrations live in [`integrations/`](integrations) and are built with [`@leroa/integration-sdk`](packages/integration-sdk) (MIT):

```ts
import { defineIntegration } from '@leroa/integration-sdk';

export default defineIntegration({
	id: 'my-integration',
	name: 'My integration',
	description: 'Does something useful',
	category: 'automation',
	author: { name: 'You' },
	config: [{ key: 'url', label: 'Endpoint', type: 'url', required: true }],
	events: ['payment.recorded'],
	async handle(event, ctx) {
		await ctx.fetch(ctx.config.url as string, { method: 'POST', body: JSON.stringify(event) });
	}
});
```

Open a pull request. Once it's reviewed and merged, it's available to every Leroa workspace. See [CONTRIBUTING.md](CONTRIBUTING.md).

Integrations can also declare `oauth` (a "Connect with…" sign-in; tokens are stored encrypted and refreshed automatically) and `sync` (a one-way push of tenants, charges and payments, run daily by `/api/cron`, after related events, and on demand with **Sync now**). Leroa records which external record each item became, so retries never create duplicates.

### QuickBooks Online

Sends tenants to QuickBooks as customers, charges as invoices (using Rent, Fees, Utilities… items) and payments as payments applied to those invoices. It's one-way: nothing is read back, and records you entered in QuickBooks yourself are never changed or deleted. Security deposits are left out unless you turn them on, and only records dated on or after **Sync records from** (the first of the month you connected, by default) are sent.

1. Create an app at [developer.intuit.com](https://developer.intuit.com) with the **Accounting** scope.
2. Add `<ORIGIN>/api/integrations/quickbooks/callback` as a redirect URI.
3. Set `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET`. With development keys, also set `QBO_ENVIRONMENT=sandbox`.
4. In **Settings → Integrations → QuickBooks Online**, click **Connect to QuickBooks Online** and choose the company.

### Xero

Sends tenants to Xero as contacts, charges as approved sales invoices and payments as payments on those invoices. Like QuickBooks it's one-way, skips deposits unless you turn them on, and only sends records dated on or after **Sync records from**. Invoice amounts include any tax set on the chosen revenue account. Xero only takes payments against invoices, so payments that aren't applied to a charge stay in Leroa.

1. Create a **Web app** at [developer.xero.com/app/manage](https://developer.xero.com/app/manage).
2. Add `<ORIGIN>/api/integrations/xero/callback` as a redirect URI.
3. Set `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`. Leroa requests `offline_access accounting.contacts accounting.transactions accounting.settings.read`. If your app has to use other scopes, set them in `XERO_SCOPES`.
4. In **Settings → Integrations → Xero**, click **Connect to Xero** and pick the organisation.

## Stack

SvelteKit 3 · Svelte 5 (remote functions, async) · Tailwind 4 · shadcn-svelte · PostgreSQL · Drizzle · Better Auth

## License

Leroa is open core:

- Core, including basic SSO, passkeys and BYOK AI: [MIT](LICENSE-MIT.txt)
- `src/lib/server/ee/` and files marked `/* @license Enterprise */`: [Leroa Enterprise License](ee/LICENSE)
- Integration SDK and integrations: MIT

See [LICENSE](LICENSE).

## Release readiness

This is pre-1.0 software. Start with a disposable evaluation and check your workflows before using real customer data. Review [SECURITY.md](SECURITY.md), test your identity provider and payment webhooks, verify scheduled jobs, and perform a backup/restore drill for your installation.

For Docker self-hosting, create `.env` once and keep its authentication secret across upgrades. Optional SSO/AI/provider settings in `.env` are passed to the application container. Use `docker compose up -d --build` when building this checkout; published images use version tags rather than an unversioned `latest` tag.

Compose now requires `POSTGRES_PASSWORD` instead of a shared default. Use a generated hex password for a new database. For an existing volume, set the **existing** database password first; changing this environment variable does not change the role's password. Rotate it separately in Postgres and update the application connection together. Never delete a volume to reset credentials.

The source Compose setup builds this checkout and requires Docker Compose 2.24 or newer for its optional `.env` file. Rebuild after updating source to pick up security fixes.
