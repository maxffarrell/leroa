import { describe, expect, it } from 'vitest';
import { seal, signState, unseal, verifyState } from './seal.ts';

const secret = 'test-secret-that-is-long-enough-123456';

describe('token sealing', () => {
	it('round-trips and uses a fresh IV each time', () => {
		const a = seal(secret, 'access-token');
		const b = seal(secret, 'access-token');
		expect(a).not.toBe(b);
		expect(a).not.toContain('access-token');
		expect(unseal(secret, a)).toBe('access-token');
	});
	it('rejects a different secret or tampering', () => {
		const sealed = seal(secret, 'refresh-token');
		expect(() => unseal('another-secret-entirely-000000000', sealed)).toThrow();
		const [v, iv, tag, ct] = sealed.split('.');
		const flipped = ct!.slice(0, -2) + (ct!.endsWith('AA') ? 'AB' : 'AA');
		expect(() => unseal(secret, [v, iv, tag, flipped].join('.'))).toThrow();
		expect(() => unseal(secret, [v, iv, tag.slice(0, 4), ct].join('.'))).toThrow();
		expect(() => unseal(secret, 'v2.a.b.c')).toThrow();
	});
});

describe('oauth state', () => {
	const state = { o: 'org', i: 'quickbooks', u: 'user', n: 'nonce', e: 123 };
	it('verifies its own signature', () => {
		expect(verifyState(secret, signState(secret, state))).toEqual(state);
	});
	it('rejects forged or malformed state', () => {
		const token = signState(secret, state);
		const [payload, sig] = token.split('.');
		const forged = Buffer.from(JSON.stringify({ ...state, o: 'other' })).toString('base64url');
		for (const bad of [
			null,
			'',
			payload!,
			`${forged}.${sig}`,
			`${token}.x`,
			signState('another-secret-entirely-000000000', state)
		])
			expect(verifyState(secret, bad)).toBeNull();
	});
});
