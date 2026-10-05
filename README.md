<div align="center">

# Leroa

**Open-source property management that's fast and easy to use.**

Properties, units, tenants, leases, rent tracking, maintenance, documents and a resident portal, in a keyboard-friendly UI. Self-host for free, or use Leroa Cloud.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmaxffarrell%2Fleroa&env=DATABASE_URL,BETTER_AUTH_SECRET&envDescription=Postgres%20URL%20and%20a%2032%2B%20char%20random%20secret&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D)
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Fmaxffarrell%2Fleroa&plugins=postgresql&envs=BETTER_AUTH_SECRET&BETTER_AUTH_SECRETDesc=32%2B+random+characters)
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
- **Enterprise** (Cloud or license key): SAML & OIDC single sign-on, passkeys

Out of scope by design: general ledger and bookkeeping. Export payments to your accounting tool through integrations instead.

## Quick start

```sh
docker compose up -d db        # or bring your own Postgres
cp .env.example .env           # set DATABASE_URL and BETTER_AUTH_SECRET
pnpm install
pnpm db:migrate
pnpm dev
```

Open http://localhost:5173, create an account, then click **Explore with demo data**.

### Self-hosting

| Target    | How                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| Docker    | `BETTER_AUTH_SECRET=$(openssl rand -hex 32) docker compose up -d`                                             |
| Railway   | Button above. Uses `railway.json` + `Dockerfile` with a Postgres plugin.                                      |
| Vercel    | Button above. Uses `@sveltejs/adapter-vercel` automatically when `VERCEL=1`. Migrations run during the build. |
| Hostinger | Button above or [docs/deploy-hostinger.md](docs/deploy-hostinger.md) (VPS Docker Manager).                    |

Environment variables are documented in [`src/env.ts`](src/env.ts).

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

## Stack

SvelteKit 3 · Svelte 5 (remote functions, async) · Tailwind 4 · shadcn-svelte · PostgreSQL · Drizzle · Better Auth

## License

Leroa is open core:

- Core: [AGPLv3](LICENSE-AGPL.txt)
- `src/lib/server/ee/` and files marked `/* @license Enterprise */`: [Leroa Enterprise License](ee/LICENSE)
- Integration SDK and integrations: MIT

See [LICENSE](LICENSE).
