# Agent notes

- Node 26, pnpm. SvelteKit 3: use `#lib/...` imports (no `$lib`), `$app/env/private` for env, config lives in `vite.config.ts`.
- Remote functions (`query`/`command`) and Svelte async (`await` in components) are enabled.
- Verify with `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`.
- Local DB: `DATABASE_URL` in `.env`; apply migrations with `node scripts/migrate.ts`.
