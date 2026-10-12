import { describe, expect, it } from 'vitest';
import { secureServices, type ServicePolicy } from './access.ts';
import * as policies from './access-policies.ts';

describe('complete browser service contracts', () => {
	it('portfolio has an explicit contract for every callable export', async () => {
		const service = await import('./services/portfolio.ts');
		expect(() =>
			secureServices(service, policies.portfolioPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('leasing has an explicit contract for every callable export', async () => {
		const service = await import('./services/leasing.ts');
		expect(() =>
			secureServices(service, policies.leasingPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('maintenance has an explicit contract for every callable export', async () => {
		const service = await import('./services/maintenance.ts');
		expect(() =>
			secureServices(service, policies.maintenancePolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('assets has an explicit contract for every callable export', async () => {
		const service = await import('./services/assets.ts');
		expect(() =>
			secureServices(service, policies.assetsPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('schedules has an explicit contract for every callable export', async () => {
		const service = await import('./services/schedules.ts');
		expect(() =>
			secureServices(service, policies.schedulesPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('turns has an explicit contract for every callable export', async () => {
		const service = await import('./services/turns.ts');
		expect(() =>
			secureServices(service, policies.turnsPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('inspections has an explicit contract for every callable export', async () => {
		const service = await import('./services/inspections.ts');
		expect(() =>
			secureServices(service, policies.inspectionsPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('agreements has an explicit contract for every callable export', async () => {
		const service = await import('./services/agreements.ts');
		expect(() =>
			secureServices(service, policies.agreementsPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('commercial has an explicit contract for every callable export', async () => {
		const service = await import('./services/commercial.ts');
		expect(() =>
			secureServices(service, policies.commercialPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('vendors has an explicit contract for every callable export', async () => {
		const service = await import('./services/vendors.ts');
		expect(() =>
			secureServices(service, policies.vendorsPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('owners has an explicit contract for every callable export', async () => {
		const service = await import('./services/owners.ts');
		expect(() =>
			secureServices(service, policies.ownersPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('listings has an explicit contract for every callable export', async () => {
		const service = await import('./services/listings.ts');
		expect(() =>
			secureServices(service, policies.listingsPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('crm has an explicit contract for every callable export', async () => {
		const service = await import('./services/crm.ts');
		expect(() =>
			secureServices(service, policies.crmPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('messaging has an explicit contract for every callable export', async () => {
		const service = await import('./services/messaging.ts');
		expect(() =>
			secureServices(service, policies.messagingPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
	it('residents has an explicit contract for every callable export', async () => {
		const service = await import('./services/residents.ts');
		expect(() =>
			secureServices(service, policies.residentsPolicy as ServicePolicy<typeof service>)
		).not.toThrow();
	});
});
