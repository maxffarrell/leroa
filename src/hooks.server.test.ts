import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit/hooks';

const mocks = vi.hoisted(() => ({
	getSession: vi.fn(),
	authHandler: vi.fn(),
	demoBlocked: vi.fn()
}));
vi.mock('$app/env', () => ({ building: false }));
vi.mock('#lib/server/auth.ts', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('better-auth/svelte-kit', () => ({ svelteKitHandler: mocks.authHandler }));
vi.mock('#lib/server/demo-mode.ts', () => ({ isDemoBlockedPath: mocks.demoBlocked }));

import { handle } from './hooks.server.ts';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getSession.mockResolvedValue(null);
	mocks.authHandler.mockResolvedValue(new Response('auth handled'));
	mocks.demoBlocked.mockReturnValue(false);
});

function request(path: string): Parameters<Handle>[0] {
	return {
		event: {
			url: new URL(path, 'https://app.example.com'),
			request: new Request(new URL(path, 'https://app.example.com')),
			locals: {}
		},
		resolve: vi.fn()
	} as unknown as Parameters<Handle>[0];
}

describe('core authentication routing', () => {
	it.each(['/api/auth/sso/register', '/api/auth/passkey/generate-register-options'])(
		'delegates %s to Better Auth without an enterprise paywall',
		async (path) => {
			const result = await handle(request(path));
			expect(result.status).toBe(200);
			expect(mocks.authHandler).toHaveBeenCalledOnce();
		}
	);

	it('preserves the demo guard before auth handling', async () => {
		mocks.demoBlocked.mockReturnValue(true);
		const result = await handle(request('/api/auth/sso/register'));
		expect(result.status).toBe(403);
		expect(mocks.authHandler).not.toHaveBeenCalled();
		expect(mocks.getSession).not.toHaveBeenCalled();
	});
});

describe('cross-site form check (kit checkOrigin is off; re-applied here)', () => {
	function formPost(path: string, origin?: string): Parameters<Handle>[0] {
		const headers: Record<string, string> = {
			'content-type': 'application/x-www-form-urlencoded'
		};
		if (origin) headers.origin = origin;
		return {
			event: {
				url: new URL(path, 'https://app.example.com'),
				request: new Request(new URL(path, 'https://app.example.com'), {
					method: 'POST',
					headers
				}),
				locals: {}
			},
			resolve: vi.fn()
		} as unknown as Parameters<Handle>[0];
	}

	it('rejects cross-site form POSTs on app routes', async () => {
		const result = await handle(formPost('/dashboard', 'https://evil.example.com'));
		expect(result.status).toBe(403);
		expect(mocks.authHandler).not.toHaveBeenCalled();
	});

	it('rejects form POSTs with no Origin on app routes', async () => {
		const result = await handle(formPost('/dashboard'));
		expect(result.status).toBe(403);
	});

	it('allows same-origin form POSTs', async () => {
		const result = await handle(formPost('/dashboard', 'https://app.example.com'));
		expect(result.status).toBe(200);
	});

	it('exempts /id/* so installs can call the OAuth API without Origin', async () => {
		const result = await handle(formPost('/id/token'));
		expect(result.status).toBe(200);
		expect(mocks.authHandler).toHaveBeenCalledOnce();
	});
});
