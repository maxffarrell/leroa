import { BETTER_AUTH_SECRET, ORIGIN } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { apiKey } from '@better-auth/api-key';
import { db } from '#lib/server/db/index.ts';
import { enterprisePlugins } from '#lib/server/ee/auth.ts';

export const auth = betterAuth({
	appName: 'Leroa',
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true },
	session: { cookieCache: { enabled: true, maxAge: 60 } },
	// Deploy targets (Railway, Vercel, Docker via scripts/server.ts) all provide x-forwarded-for.
	advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
	plugins: [
		organization({ allowUserToCreateOrganization: true }),
		apiKey({ references: 'organization', defaultPrefix: 'lr_', enableMetadata: true }),
		...enterprisePlugins,
		sveltekitCookies(getRequestEvent) // must be last
	]
});

export type Auth = typeof auth;
