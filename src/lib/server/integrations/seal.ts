import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	hkdfSync,
	randomBytes,
	timingSafeEqual
} from 'node:crypto';

const keyFor = (secret: string) =>
	Buffer.from(hkdfSync('sha256', secret, 'leroa-integrations', 'oauth-tokens', 32));

/** Encrypts a token with AES-256-GCM under a key derived from the server secret. */
export function seal(secret: string, plain: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv);
	const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return ['v1', iv, cipher.getAuthTag(), ct]
		.map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
		.join('.');
}

export function unseal(secret: string, sealed: string) {
	const [v, iv, tag, ct, extra] = sealed.split('.');
	if (v !== 'v1' || !iv || !tag || ct === undefined || extra !== undefined)
		throw new Error('Unreadable token');
	const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), Buffer.from(iv, 'base64url'), {
		authTagLength: 16
	});
	decipher.setAuthTag(Buffer.from(tag, 'base64url'));
	return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString(
		'utf8'
	);
}

/** OAuth `state`: organization, integration, user, nonce (also set as a cookie) and expiry. */
export type OAuthState = { o: string; i: string; u: string; n: string; e: number };

const mac = (secret: string, payload: string) =>
	createHmac('sha256', secret).update(`integration-oauth:${payload}`).digest('base64url');

export function signState(secret: string, state: OAuthState) {
	const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
	return `${payload}.${mac(secret, payload)}`;
}

export function verifyState(secret: string, token: string | null): OAuthState | null {
	if (!token) return null;
	const [payload, sig, extra] = token.split('.');
	if (!payload || !sig || extra !== undefined) return null;
	const want = Buffer.from(mac(secret, payload));
	const got = Buffer.from(sig);
	if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
	try {
		const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
		const ok =
			[s.o, s.i, s.u, s.n].every((x) => typeof x === 'string' && x) && typeof s.e === 'number';
		return ok ? s : null;
	} catch {
		return null;
	}
}
