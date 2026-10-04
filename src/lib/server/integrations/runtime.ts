import { and, eq } from 'drizzle-orm';
import type { IntegrationDefinition, KeystoneEvent } from '@keystone/integration-sdk';
import { toManifest } from '@keystone/integration-sdk';
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

const boundedFetch: typeof fetch = (input, init) =>
	fetch(input, {
		...init,
		headers: { 'user-agent': 'Keystone-Integrations/1.0', ...(init?.headers ?? {}) },
		signal: init?.signal ?? AbortSignal.timeout(10_000)
	});

export async function dispatchToIntegrations(event: KeystoneEvent<string>) {
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
			if (!def || !def.events.includes(event.type as never)) return;
			await def.handle(event as KeystoneEvent, {
				config: install.config,
				workspace: { id: event.organizationId, name: orgName },
				fetch: boundedFetch,
				log: (...args) => console.log(`[integration:${def.id}]`, ...args)
			});
		})
	);
}
