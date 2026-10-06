import { createHash, randomBytes } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { and, count, desc, eq, lt } from 'drizzle-orm';
import * as v from 'valibot';
import { LEROA_PROFILE_HUB } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import { profileCode, profileGrant, profileToken, residentProfile } from '#lib/server/db/schema.ts';
import {
	blankProfile,
	parseScopes,
	profileData,
	shareProfile,
	validClientId,
	validRedirect,
	type ProfileData,
	type ProfileScope
} from '#lib/profile.ts';

/** The Leroa Profile service side: residents keep one profile and choose which installs can read it. */
export const isProfileHub = (): boolean => LEROA_PROFILE_HUB;

export function assertHub() {
	if (!LEROA_PROFILE_HUB) error(404, 'Not found');
}

const hash = (s: string) => createHash('sha256').update(s).digest('base64url');
const CODE_TTL_MS = 2 * 60 * 1000;

export async function getProfile(userId: string) {
	const row = await db.query.residentProfile.findFirst({
		where: (p, { eq }) => eq(p.userId, userId)
	});
	const parsed = row ? v.safeParse(profileData, row.data) : null;
	return {
		data: parsed?.success ? parsed.output : blankProfile(),
		updatedAt: row?.updatedAt ?? null
	};
}

export async function saveProfile(userId: string, data: ProfileData) {
	await db
		.insert(residentProfile)
		.values({ userId, data })
		.onConflictDoUpdate({ target: residentProfile.userId, set: { data, updatedAt: new Date() } });
}

export type AuthorizeRequest = {
	clientId: string;
	redirectUri: string;
	state: string;
	codeChallenge: string;
	scopes: ProfileScope[];
};

/** OAuth 2.0 authorization request. The client id is the install's origin, so nothing is pre-registered. */
export function parseAuthorize(url: URL): AuthorizeRequest {
	const q = url.searchParams;
	const clientId = validClientId(q.get('client_id'));
	if (!clientId) error(400, 'The install sent an invalid client_id.');
	const redirectUri = q.get('redirect_uri');
	if (!validRedirect(clientId, redirectUri))
		error(400, "The redirect_uri must be the install's own profile callback.");
	if (q.get('response_type') !== 'code') error(400, 'Unsupported response_type.');
	const codeChallenge = q.get('code_challenge') ?? '';
	if (q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge))
		error(400, 'PKCE with S256 is required.');
	const state = q.get('state') ?? '';
	if (!state || state.length > 200) error(400, 'Missing state.');
	const scopes = parseScopes(q.get('scope'));
	if (!scopes.length) error(400, 'No valid scope requested.');
	return { clientId, redirectUri: redirectUri!, state, codeChallenge, scopes };
}

export async function findGrant(userId: string, clientId: string) {
	return db.query.profileGrant.findFirst({
		where: (g, { and, eq }) => and(eq(g.userId, userId), eq(g.clientId, clientId))
	});
}

export async function approve(userId: string, req: AuthorizeRequest, chosen: ProfileScope[]) {
	const scopes = chosen.filter((s) => req.scopes.includes(s));
	if (!scopes.length) error(400, 'Choose at least one thing to share');
	const [grant] = await db
		.insert(profileGrant)
		.values({ userId, clientId: req.clientId, scopes })
		.onConflictDoUpdate({
			target: [profileGrant.userId, profileGrant.clientId],
			set: { scopes, updatedAt: new Date() }
		})
		.returning();
	const code = randomBytes(32).toString('base64url');
	await db.delete(profileCode).where(lt(profileCode.expiresAt, new Date()));
	await db.insert(profileCode).values({
		codeHash: hash(code),
		grantId: grant!.id,
		codeChallenge: req.codeChallenge,
		redirectUri: req.redirectUri,
		expiresAt: new Date(Date.now() + CODE_TTL_MS)
	});
	const u = new URL(req.redirectUri);
	u.searchParams.set('code', code);
	u.searchParams.set('state', req.state);
	return u.toString();
}

export function denyUrl(req: AuthorizeRequest) {
	const u = new URL(req.redirectUri);
	u.searchParams.set('error', 'access_denied');
	u.searchParams.set('state', req.state);
	return u.toString();
}

export const tokenRequest = v.object({
	grant_type: v.literal('authorization_code'),
	code: v.pipe(v.string(), v.maxLength(200)),
	code_verifier: v.pipe(v.string(), v.regex(/^[A-Za-z0-9._~-]{43,128}$/)),
	client_id: v.pipe(v.string(), v.maxLength(300)),
	redirect_uri: v.pipe(v.string(), v.maxLength(500))
});

/** Redeems a code once. Returns null for anything invalid (reported as `invalid_grant`). */
export async function exchangeCode(input: v.InferOutput<typeof tokenRequest>) {
	const [row] = await db
		.delete(profileCode)
		.where(eq(profileCode.codeHash, hash(input.code)))
		.returning();
	if (!row || row.expiresAt < new Date() || row.redirectUri !== input.redirect_uri) return null;
	if (hash(input.code_verifier) !== row.codeChallenge) return null;
	const grant = await db.query.profileGrant.findFirst({
		where: (g, { eq }) => eq(g.id, row.grantId)
	});
	if (!grant || grant.clientId !== input.client_id) return null;
	const token = `lp_${randomBytes(32).toString('base64url')}`;
	await db.insert(profileToken).values({ tokenHash: hash(token), grantId: grant.id });
	return {
		access_token: token,
		token_type: 'Bearer',
		scope: grant.scopes.join(' '),
		sub: grant.id
	};
}

async function grantForToken(token: string) {
	const [row] = await db
		.select({ grant: profileGrant })
		.from(profileToken)
		.innerJoin(profileGrant, eq(profileGrant.id, profileToken.grantId))
		.where(eq(profileToken.tokenHash, hash(token)));
	return row?.grant ?? null;
}

export async function profileForToken(token: string) {
	const grant = await grantForToken(token);
	if (!grant) return null;
	await db
		.update(profileGrant)
		.set({ lastUsedAt: new Date() })
		.where(eq(profileGrant.id, grant.id));
	const { data, updatedAt } = await getProfile(grant.userId);
	const scopes = parseScopes(grant.scopes.join(' '));
	return {
		sub: grant.id,
		scope: scopes.join(' '),
		updatedAt: updatedAt?.toISOString() ?? null,
		profile: shareProfile(data, scopes)
	};
}

/** Revokes one token; the grant goes once its last token is gone. */
export async function revokeToken(token: string) {
	const [t] = await db
		.delete(profileToken)
		.where(eq(profileToken.tokenHash, hash(token)))
		.returning();
	if (!t) return;
	const [left] = await db
		.select({ n: count() })
		.from(profileToken)
		.where(eq(profileToken.grantId, t.grantId));
	if (!left?.n) await db.delete(profileGrant).where(eq(profileGrant.id, t.grantId));
}

export async function listGrants(userId: string) {
	return db
		.select({
			id: profileGrant.id,
			clientId: profileGrant.clientId,
			scopes: profileGrant.scopes,
			createdAt: profileGrant.createdAt,
			lastUsedAt: profileGrant.lastUsedAt
		})
		.from(profileGrant)
		.where(eq(profileGrant.userId, userId))
		.orderBy(desc(profileGrant.createdAt));
}

export async function revokeGrant(userId: string, id: string) {
	await db
		.delete(profileGrant)
		.where(and(eq(profileGrant.userId, userId), eq(profileGrant.id, id)));
}

export function bearer(request: Request) {
	const h = request.headers.get('authorization') ?? '';
	return h.startsWith('Bearer ') ? h.slice(7).trim() || null : null;
}
