import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ LEROA_CLOUD: false, LEROA_ENTERPRISE_KEY: '' }));
vi.mock('$app/env/private', () => env);

import { hasFeature, isEnterpriseEnabled, type Feature } from './features.ts';

beforeEach(() => {
	env.LEROA_CLOUD = false;
	env.LEROA_ENTERPRISE_KEY = '';
});

describe('self-hosted core features', () => {
	it.each(['sso', 'passkeys', 'ai'] as const)('%s needs no subscription', (feature) => {
		expect(isEnterpriseEnabled()).toBe(false);
		expect(hasFeature(feature)).toBe(true);
	});

	it.each(['audit_export', 'custom_roles', 'branding', 'channels'] as Feature[])(
		'%s stays paid',
		(feature) => {
			expect(hasFeature(feature)).toBe(false);
			env.LEROA_ENTERPRISE_KEY = 'existing-entitlement';
			expect(hasFeature(feature)).toBe(true);
			env.LEROA_ENTERPRISE_KEY = '';
			env.LEROA_CLOUD = true;
			expect(hasFeature(feature)).toBe(true);
		}
	);
});
