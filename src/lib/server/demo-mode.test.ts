import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const env = vi.hoisted(() => ({ LEROA_DEMO: false }));
const mocks = vi.hoisted(() => ({
	select: vi.fn(),
	update: vi.fn(),
	loadDemoData: vi.fn(),
	signUpEmail: vi.fn(),
	createOrganization: vi.fn()
}));
vi.mock('$app/env/private', () => env);
vi.mock('./db/index.ts', () => ({ db: { select: mocks.select, update: mocks.update } }));
vi.mock('./auth.ts', () => ({
	auth: {
		api: {
			signUpEmail: mocks.signUpEmail,
			createOrganization: mocks.createOrganization
		}
	}
}));
vi.mock('./services/demo.ts', () => ({ loadDemoData: mocks.loadDemoData }));
import { startDemo } from './demo-mode.ts';

beforeEach(() => {
	vi.clearAllMocks();
	env.LEROA_DEMO = false;
});

describe('demo portal provisioning', () => {
	it('normal installations cannot create or link demo profiles', async () => {
		await expect(startDemo('normal')).rejects.toMatchObject({ status: 404 });
		expect(mocks.signUpEmail).not.toHaveBeenCalled();
		expect(mocks.select).not.toHaveBeenCalled();
		expect(mocks.update).not.toHaveBeenCalled();
	});
	it('links the manager demo to its own seeded profile', async () => {
		env.LEROA_DEMO = true;
		mocks.signUpEmail.mockResolvedValue({ user: { id: 'demo-user' } });
		mocks.createOrganization.mockResolvedValue({
			id: 'private-demo-org',
			name: 'Demo',
			slug: 'demo'
		});
		mocks.loadDemoData.mockResolvedValue({});
		// Expired-demo cleanup finds no users; the next query looks up the new portal profile.
		mocks.select.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([]) }) });
		const profileWhere = vi.fn((_condition: import('drizzle-orm').SQL) => ({
			limit: () => Promise.resolve([{ id: 'sample-profile' }])
		}));
		mocks.select.mockReturnValueOnce({ from: () => ({ where: profileWhere }) });
		const updateWhere = vi
			.fn<(_condition: import('drizzle-orm').SQL) => Promise<void>>()
			.mockResolvedValue(undefined);
		const set = vi.fn(() => ({ where: updateWhere }));
		mocks.update.mockReturnValue({ set });

		await startDemo('portal-manager');

		expect(mocks.loadDemoData).toHaveBeenCalledWith(
			expect.objectContaining({ orgId: 'private-demo-org' })
		);
		expect(set).toHaveBeenCalledWith({ portalUserId: 'demo-user' });
		const dialect = new PgDialect();
		expect(dialect.sqlToQuery(profileWhere.mock.calls[0]![0]).params).toEqual(['private-demo-org']);
		expect(dialect.sqlToQuery(updateWhere.mock.calls[0]![0]).params).toEqual([
			'sample-profile',
			'private-demo-org'
		]);
	});
});
