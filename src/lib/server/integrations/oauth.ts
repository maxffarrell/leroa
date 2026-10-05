import { error } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { BETTER_AUTH_SECRET } from '$app/env/private';
import {
	SyncFatalError,
	type Connection,
	type IntegrationDefinition,
	type OAuthSpec
} from '@leroa/integration-sdk';
import { db } from '#lib/server/db/index.ts';
import { integrationConnection, integrationInstall } from '#lib/server/db/schema.ts';
import { oauthApp, type OAuthApp } from './credentials.ts';
import { seal, signState, unseal, verifyState } from './seal.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each integration has its own config shape
export type OAuthIntegration = IntegrationDefinition<any> & { oauth: OAuthSpec };
type ConnectionRow = typeof integrationConnection.$inferSelect;
type TokenResponse = {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
};

const STATE_TTL_MS = 10 * 60_000;
/** Refresh access tokens this long before they expire. */
const EARLY_REFRESH_MS = 2 * 60_000;

export const stateCookie = (id: string) => `leroa_oauth_${id}`;
export const redirectUri = (origin: string, id: string) =>
	`${origin}/api/integrations/${id}/callback`;

const timeout = () => AbortSignal.timeout(15_000);
const basic = (app: OAuthApp) =>
	`Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64')}`;

function requireApp(def: OAuthIntegration) {
	const app = oauthApp(def.id);
	if (!app) error(400, `${def.name} isn't set up on this server`);
	return app;
}

export function startOAuth(def: OAuthIntegration, orgId: string, userId: string, origin: string) {
	const app = requireApp(def);
	const nonce = randomBytes(16).toString('base64url');
	const state = signState(BETTER_AUTH_SECRET, {
		o: orgId,
		i: def.id,
		u: userId,
		n: nonce,
		e: Date.now() + STATE_TTL_MS
	});
	const url = new URL(app.authorizeUrl ?? def.oauth.authorizeUrl);
	url.searchParams.set('client_id', app.clientId);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', (app.scopes ?? def.oauth.scopes).join(' '));
	url.searchParams.set('redirect_uri', redirectUri(origin, def.id));
	url.searchParams.set('state', state);
	return { url: url.toString(), nonce };
}

class TokenError extends Error {
	constructor(
		message: string,
		readonly code?: string
	) {
		super(message);
	}
}

async function tokenRequest(def: OAuthIntegration, app: OAuthApp, body: URLSearchParams) {
	const res = await fetch(app.tokenUrl ?? def.oauth.tokenUrl, {
		method: 'POST',
		headers: {
			authorization: basic(app),
			accept: 'application/json',
			'content-type': 'application/x-www-form-urlencoded'
		},
		body,
		signal: timeout()
	});
	const json = (await res.json().catch(() => ({}))) as TokenResponse;
	if (!res.ok || !json.access_token)
		throw new TokenError(
			json.error_description ?? json.error ?? `Token request failed (HTTP ${res.status})`,
			json.error
		);
	return json as TokenResponse & { access_token: string };
}

function tokenColumns(
	t: TokenResponse & { access_token: string },
	previousRefresh?: string | null
) {
	return {
		accessToken: seal(BETTER_AUTH_SECRET, t.access_token),
		// Providers that rotate refresh tokens return a new one; others keep the old one valid.
		refreshToken: t.refresh_token
			? seal(BETTER_AUTH_SECRET, t.refresh_token)
			: (previousRefresh ?? null),
		expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null
	};
}

const where = (orgId: string, integrationId: string) =>
	and(
		eq(integrationConnection.organizationId, orgId),
		eq(integrationConnection.integrationId, integrationId)
	);

/** Exchanges the authorization code and stores the connection. */
export async function completeOAuth(
	def: OAuthIntegration,
	url: URL,
	cookieNonce: string | undefined,
	ctx: { orgId: string; userId: string },
	origin: string
) {
	const state = verifyState(BETTER_AUTH_SECRET, url.searchParams.get('state'));
	if (
		!state ||
		state.i !== def.id ||
		state.o !== ctx.orgId ||
		state.u !== ctx.userId ||
		state.e < Date.now() ||
		!cookieNonce ||
		cookieNonce !== state.n
	)
		error(400, 'This connection attempt expired or was started in another browser. Try again.');
	const code = url.searchParams.get('code');
	if (!code) error(400, 'Missing authorization code');

	const app = requireApp(def);
	const tokens = await tokenRequest(
		def,
		app,
		new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri(origin, def.id)
		})
	);
	const params: Record<string, string> = {};
	for (const key of def.oauth.callbackParams ?? []) {
		const value = url.searchParams.get(key);
		if (value) params[key] = value.slice(0, 200);
	}
	const connection = { accessToken: tokens.access_token, params: { ...params, ...app.params } };
	const fetcher: typeof fetch = (input, init) => fetch(input, { ...init, signal: timeout() });
	let account = def.oauth.accountParam ? (params[def.oauth.accountParam] ?? '') : '';
	let accountName: string | null = null;
	if (def.oauth.account) {
		const found = await def.oauth.account(connection, fetcher).catch((err: unknown) => {
			console.warn(`[integration:${def.id}] could not find the connected account`, err);
			error(400, err instanceof Error ? err.message : `Could not connect ${def.name}`);
		});
		account = found.id.slice(0, 200);
		accountName = found.name ?? null;
		for (const [key, value] of Object.entries(found.params ?? {}))
			params[key] = value.slice(0, 200);
	} else {
		try {
			accountName = (await def.oauth.accountName?.(connection, fetcher)) ?? null;
		} catch (err) {
			console.warn(`[integration:${def.id}] could not read account name`, err);
		}
	}

	const values = {
		...tokenColumns(tokens),
		params,
		account,
		accountName: accountName?.slice(0, 200) ?? null,
		status: 'connected' as const,
		connectedBy: ctx.userId,
		syncStartedAt: null,
		lastError: null
	};
	await db
		.insert(integrationConnection)
		.values({ organizationId: ctx.orgId, integrationId: def.id, ...values })
		.onConflictDoUpdate({
			target: [integrationConnection.organizationId, integrationConnection.integrationId],
			set: values
		});

	const [install] = await db
		.select()
		.from(integrationInstall)
		.where(
			and(
				eq(integrationInstall.organizationId, ctx.orgId),
				eq(integrationInstall.integrationId, def.id)
			)
		);
	const config = { ...(def.defaults?.() ?? {}), ...(install?.config ?? {}) };
	await db
		.insert(integrationInstall)
		.values({ organizationId: ctx.orgId, integrationId: def.id, config, enabled: true })
		.onConflictDoUpdate({
			target: [integrationInstall.organizationId, integrationInstall.integrationId],
			set: { config, enabled: true }
		});
}

async function needsReconnect(row: ConnectionRow, message: string) {
	await db
		.update(integrationConnection)
		.set({ status: 'reconnect', lastError: message, syncStartedAt: null })
		.where(where(row.organizationId, row.integrationId));
	return new SyncFatalError(message);
}

/** A usable access token for the connection, refreshing it first when it is about to expire. */
export async function connectionFor(
	def: OAuthIntegration,
	row: ConnectionRow
): Promise<Connection> {
	const app = oauthApp(def.id);
	if (!app) throw new SyncFatalError(`${def.name} isn't set up on this server`);
	const params = { ...row.params, ...app.params };
	const reconnect = `${def.name} needs to be reconnected`;
	const read = (sealed: string) => {
		try {
			return unseal(BETTER_AUTH_SECRET, sealed);
		} catch {
			return null;
		}
	};
	const fresh = (r: ConnectionRow) =>
		!r.expiresAt || r.expiresAt.getTime() > Date.now() + EARLY_REFRESH_MS;

	if (fresh(row)) {
		const accessToken = read(row.accessToken);
		if (!accessToken) throw await needsReconnect(row, reconnect);
		return { accessToken, params };
	}

	// Lock the row so concurrent syncs don't both spend the same (rotating) refresh token.
	const result = await db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(integrationConnection)
			.where(where(row.organizationId, row.integrationId))
			.for('update');
		if (!current) return { fatal: `${def.name} was disconnected` };
		if (fresh(current)) {
			const accessToken = read(current.accessToken);
			return accessToken ? { accessToken } : { reconnect };
		}
		const refreshToken = current.refreshToken && read(current.refreshToken);
		if (!refreshToken) return { reconnect };
		try {
			const tokens = await tokenRequest(
				def,
				app,
				new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
			);
			await tx
				.update(integrationConnection)
				.set(tokenColumns(tokens, current.refreshToken))
				.where(where(row.organizationId, row.integrationId));
			return { accessToken: tokens.access_token };
		} catch (err) {
			if (err instanceof TokenError && err.code === 'invalid_grant') return { reconnect };
			throw err;
		}
	});
	if ('accessToken' in result && result.accessToken)
		return { accessToken: result.accessToken, params };
	if ('reconnect' in result && result.reconnect) throw await needsReconnect(row, result.reconnect);
	throw new SyncFatalError('fatal' in result ? result.fatal : reconnect);
}

/** Revokes the tokens (best effort) and removes the connection. Sync history is kept. */
export async function disconnect(def: OAuthIntegration, orgId: string) {
	const [row] = await db.select().from(integrationConnection).where(where(orgId, def.id));
	if (!row) return;
	const app = oauthApp(def.id);
	const revokeUrl = app?.revokeUrl ?? def.oauth.revokeUrl;
	const token = row.refreshToken ? unsealQuiet(row.refreshToken) : unsealQuiet(row.accessToken);
	if (app && revokeUrl && token) {
		const json = def.oauth.revokeBody === 'json';
		try {
			await fetch(revokeUrl, {
				method: 'POST',
				headers: {
					authorization: basic(app),
					accept: 'application/json',
					'content-type': json ? 'application/json' : 'application/x-www-form-urlencoded'
				},
				body: json ? JSON.stringify({ token }) : new URLSearchParams({ token }),
				signal: timeout()
			});
		} catch (err) {
			console.warn(`[integration:${def.id}] token revocation failed`, err);
		}
	}
	await db.delete(integrationConnection).where(where(orgId, def.id));
}

function unsealQuiet(sealed: string) {
	try {
		return unseal(BETTER_AUTH_SECRET, sealed);
	} catch {
		return null;
	}
}
