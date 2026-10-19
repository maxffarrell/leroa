# Contributing

## Development

Use Node 26 and pnpm. Configure the database and a persistent random authentication secret in your local `.env` before running migrations.

```sh
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Before requesting review run `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build`.

## Security and fixtures

Never commit real credentials or local `.env` files. Keep `.env.example` placeholder-only; use obviously fake test fixtures and disposable local/CI credentials. Report vulnerabilities privately using [SECURITY.md](SECURITY.md), not public issues. Do not include secrets or customer data in logs, screenshots or PR descriptions.

The root ignore rules cover all `.env.*` files except `.env.example`. There is no committed `.env.test` fixture. Do not ignore or delete the committed Drizzle migration history; keep local experiments in `.scratch` or `*.scratch.*` / `*.local.*` files instead.

## Conventions

- Business logic lives in `src/lib/server/services/`. UI talks to it through remote functions in `src/lib/remote/*.remote.ts`; the REST API in `src/routes/api/v1` reuses the same services.
- Money is stored and sent as integer cents.
- Every write that matters calls `emit()` so it shows up in the activity feed, webhooks and integrations.
- Schema changes: edit `src/lib/server/db/schema.ts`, then `pnpm db:generate --name <change>`.
- UI uses shadcn-svelte components from `src/lib/components/ui`. Keep app-specific components in `src/lib/components/app`.
- Basic SSO, passkeys and BYOK AI belong to the MIT core (`src/lib/server/auth-plugins.ts` and `src/lib/server/ai/`).
- Enterprise code goes in `src/lib/server/ee/` with a `/* @license Enterprise */` header. Contributions there are accepted under the Enterprise license.

## Contributing an integration

1. Create `integrations/<id>/index.ts` using `defineIntegration` from `@leroa/integration-sdk`.
2. Register it in `integrations/index.ts`.
3. Integrations must only use `ctx.fetch` for network access, must not store data outside their config, and must handle only the events they declare.
4. Open a PR. A maintainer reviews the code and the permissions it needs; once merged it ships to every workspace.
