import * as v from 'valibot';
import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import { assertNotDemo } from '#lib/server/demo-mode.ts';
import * as svc from '#lib/server/services/online-payments.ts';

const providerId = v.pipe(v.string(), v.maxLength(32));

export const getPaymentSettings = query(async () =>
	svc.paymentSettingsView((await requireOrg()).orgId)
);

export const setProviderEnabled = command(
	v.object({ provider: providerId, enabled: v.boolean() }),
	async ({ provider, enabled }) => {
		assertNotDemo();
		await svc.setProviderEnabled(await requireOrg('admin'), provider, enabled);
		void getPaymentSettings().refresh();
	}
);

export const connectProvider = command(providerId, async (provider) => {
	assertNotDemo();
	return { url: await svc.connectProvider(await requireOrg('admin'), provider) };
});

export const disconnectProvider = command(providerId, async (provider) => {
	assertNotDemo();
	await svc.disconnectProvider(await requireOrg('admin'), provider);
	void getPaymentSettings().refresh();
});
