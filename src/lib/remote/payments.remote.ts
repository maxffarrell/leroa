import * as v from 'valibot';
import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import { assertNotDemo } from '#lib/server/demo-mode.ts';
import * as svc from '#lib/server/services/online-payments.ts';

export const getPaymentSettings = query(async () =>
	svc.paymentSettingsView((await requireOrg()).orgId)
);

export const setOnlinePayments = command(v.boolean(), async (enabled) => {
	assertNotDemo();
	await svc.setOnlinePayments(await requireOrg('admin'), enabled);
	void getPaymentSettings().refresh();
});

export const connectStripe = command(async () => {
	assertNotDemo();
	return { url: await svc.connectStripe(await requireOrg('admin')) };
});

export const disconnectStripe = command(async () => {
	assertNotDemo();
	await svc.disconnectStripe(await requireOrg('admin'));
	void getPaymentSettings().refresh();
});
