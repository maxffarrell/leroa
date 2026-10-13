import { describe, expect, it } from 'vitest';
import {
	applicationPrefill,
	blankProfile,
	parseProfileFile,
	parseScopes,
	profileFile,
	safeNext,
	shareProfile,
	validClientId,
	validRedirect,
	type ProfileData
} from './profile.ts';

const profile: ProfileData = {
	contact: { firstName: 'Ana', lastName: 'Ruiz', email: 'ana@example.com', phone: '555-0101' },
	household: { members: [{ name: 'Leo Ruiz', relationship: 'Partner' }] },
	pets: [{ kind: 'Dog', name: 'Mochi', breed: 'Shiba Inu', weight: '22 lb' }],
	application: { currentAddress: '1 Elm St', employer: 'Acme', monthlyIncome: 650000 }
};

describe('profile scopes', () => {
	it('keeps only known scopes in a fixed order', () => {
		expect(parseScopes('pets contact,bogus  application')).toEqual([
			'contact',
			'pets',
			'application'
		]);
		expect(parseScopes(null)).toEqual([]);
	});

	it('shares only granted sections', () => {
		expect(shareProfile(profile, ['contact'])).toEqual({ contact: profile.contact });
		expect(shareProfile(profile, [])).toEqual({});
		expect(Object.keys(shareProfile(profile, ['pets', 'household'])).sort()).toEqual([
			'household',
			'pets'
		]);
	});
});

describe('application prefill', () => {
	it('maps shared sections onto the application form', () => {
		expect(applicationPrefill(profile)).toEqual({
			firstName: 'Ana',
			lastName: 'Ruiz',
			email: 'ana@example.com',
			phone: '555-0101',
			occupants: 2,
			pets: 'Dog: Mochi (Shiba Inu, 22 lb)',
			employer: 'Acme',
			monthlyIncome: 650000,
			currentAddress: '1 Elm St'
		});
	});

	it('leaves out empty and unshared fields', () => {
		const blank = blankProfile();
		expect(applicationPrefill({ contact: { ...blank.contact, firstName: 'Ana' } })).toEqual({
			firstName: 'Ana'
		});
		expect(applicationPrefill({})).toEqual({});
	});
});

describe('client ids and redirects', () => {
	it('accepts https origins and http only on localhost', () => {
		expect(validClientId('https://pm.example.com')).toBe('https://pm.example.com');
		expect(validClientId('http://localhost:5173')).toBe('http://localhost:5173');
		expect(validClientId('http://pm.example.com')).toBeNull();
		expect(validClientId('https://pm.example.com/path')).toBeNull();
		expect(validClientId('javascript:alert(1)')).toBeNull();
		expect(validClientId(null)).toBeNull();
	});

	it('only redirects to the client’s own origin', () => {
		const c = 'https://pm.example.com';
		expect(validRedirect(c, `${c}/api/profile/callback`)).toBe(true);
		expect(validRedirect(c, `${c}/api/auth/callback/leroa`)).toBe(true);
		expect(validRedirect(c, 'https://evil.example/api/profile/callback')).toBe(false);
		expect(validRedirect(c, 'http://pm.example.com/api/profile/callback')).toBe(false);
	});

	it('rejects open redirects in next', () => {
		expect(safeNext('/l/acme/123#apply')).toBe('/l/acme/123#apply');
		expect(safeNext('//evil.example')).toBe('/portal');
		expect(safeNext('https://evil.example')).toBe('/portal');
		expect(safeNext('/\\evil.example')).toBe('/portal');
	});
});

describe('profile file', () => {
	it('round-trips an export and rejects other files', () => {
		expect(parseProfileFile(JSON.parse(JSON.stringify(profileFile(profile))))).toEqual(profile);
		expect(parseProfileFile({ format: 'other', version: 1, profile })).toBeNull();
		expect(parseProfileFile(null)).toBeNull();
	});
});
