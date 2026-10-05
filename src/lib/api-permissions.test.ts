import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
	allows,
	apiPermissionsSchema,
	describePermissions,
	everything,
	normalizePermissions,
	withLevel
} from './api-permissions.ts';

describe('api permissions', () => {
	it('treats write as implying read and drops unknown resources', () => {
		expect(normalizePermissions({ payments: ['write'], secrets: ['read'] })).toEqual({
			payments: ['read', 'write']
		});
	});

	it('denies by default', () => {
		expect(allows(null, 'properties', 'read')).toBe(false);
		expect(allows({ properties: ['read'] }, 'properties', 'write')).toBe(false);
		expect(allows({ properties: ['read'] }, 'tenants', 'read')).toBe(false);
		expect(allows({ properties: ['read', 'write'] }, 'properties', 'write')).toBe(true);
	});

	it('describes presets', () => {
		expect(describePermissions(everything('write'))).toBe('full');
		expect(describePermissions(everything('read'))).toBe('read');
		expect(describePermissions(null)).toBe('none');
		expect(describePermissions(withLevel(everything('read'), 'payments', 'none'))).toBe('custom');
	});

	it('rejects empty or invalid grants', () => {
		expect(v.safeParse(apiPermissionsSchema, {}).success).toBe(false);
		expect(v.safeParse(apiPermissionsSchema, { units: ['delete'] }).success).toBe(false);
		expect(v.parse(apiPermissionsSchema, { units: ['read'] })).toEqual({ units: ['read'] });
	});
});
