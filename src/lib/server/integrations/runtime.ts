import { outboundFetch } from '#lib/server/outbound-http.ts';
import { and, eq } from 'drizzle-orm';
import type { IntegrationDefinition, LeroaEvent } from '@leroa/integration-sdk';
import { toManifest } from '@leroa/integration-sdk';
import { integrations } from '../../../../integrations/index.ts';
import { db } from '#lib/server/db/index.ts';
import { integrationInstall, organization } from '#lib/server/db/schema.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each integration has its own config shape
const byId = new Map<string, IntegrationDefinition<any>>(integrations.map((i) => [i.id, i]));

export function listIntegrations() {
	return integrations.map(toManifest);
}

export function getIntegration(id: string) {
	return byId.get(id);
}

export const boundedFetch: typeof fetch = (input, init) =>
	outboundFetch(input, {
		...init,
		headers: { 'user-agent': 'Leroa-Integrations/1.0', ...(init?.headers ?? {}) },
		signal: init?.signal ?? AbortSignal.timeout(10_000)
	});

export async function dispatchToIntegrations(event: LeroaEvent<string>) {
	const installs = await db
		.select({ install: integrationInstall, orgName: organization.name })
		.from(integrationInstall)
		.innerJoin(organization, eq(organization.id, integrationInstall.organizationId))
		.where(
			and(
				eq(integrationInstall.organizationId, event.organizationId),
				eq(integrationInstall.enabled, true)
			)
		);

	await Promise.allSettled(
		installs.map(async ({ install, orgName }) => {
			const def = byId.get(install.integrationId);
			if (def?.sync?.triggers?.includes(event.type as never)) {
				const { runSync } = await import('./sync.ts');
				void runSync(event.organizationId, def.id).catch((err) =>
					console.error(`[integration:${def.id}] background sync failed`, err)
				);
			}
			if (!def?.handle || !def.events.includes(event.type as never)) return;
			await def.handle(event as LeroaEvent, {
				config: install.config,
				workspace: { id: event.organizationId, name: orgName },
				fetch: boundedFetch,
				log: (...args) => console.log(`[integration:${def.id}]`, ...args)
			});
		})
	);
}
