import { secureServices } from '#lib/server/access.ts';
import { command, query } from '$app/server';
import { requireOrg, requirePerm, assertScope } from '#lib/server/context.ts';
import * as svcRaw from '#lib/server/services/commercial.ts';
import { commercialPolicy } from '#lib/server/access-policies.ts';
const svc = secureServices(svcRaw, commercialPolicy);
import {
	clauseInput,
	criticalDateDoneInput,
	criticalDateInput,
	idSchema,
	tiItemInput,
	tiItemUpdate
} from '#lib/schemas.ts';

export const getClauses = query(idSchema, async (leaseId) =>
	svc.listClauses((await requireOrg()).orgId, leaseId)
);

export const getCriticalDates = query(idSchema, async (leaseId) =>
	svc.listCriticalDates((await requireOrg()).orgId, leaseId)
);

export const getUpcomingDates = query(async () =>
	svc.upcomingCriticalDates((await requireOrg()).orgId)
);

export const addClause = command(clauseInput, async (input) => {
	const row = await svc.addClause(
		await assertScope(await requirePerm('leases', 'write'), input),
		input
	);
	getClauses(input.leaseId).refresh();
	return row;
});

export const removeClause = command(idSchema, async (id) =>
	svc.deleteClause(await requirePerm('leases', 'write'), id)
);

export const addCriticalDate = command(criticalDateInput, async (input) => {
	const row = await svc.addCriticalDate(
		await assertScope(await requirePerm('leases', 'write'), input),
		input
	);
	getCriticalDates(input.leaseId).refresh();
	getUpcomingDates().refresh();
	return row;
});

export const setDateDone = command(criticalDateDoneInput, async (input) => {
	const row = await svc.setCriticalDateDone(
		await requirePerm('leases', 'write'),
		input.id,
		input.done
	);
	getCriticalDates(row.leaseId).refresh();
	getUpcomingDates().refresh();
	return row;
});

export const removeCriticalDate = command(idSchema, async (id) =>
	svc.deleteCriticalDate(await requirePerm('leases', 'write'), id)
);

export const getTiItems = query(idSchema, async (leaseId) =>
	svc.listTiItems((await requireOrg()).orgId, leaseId)
);

export const addTiItem = command(tiItemInput, async (input) => {
	const row = await svc.addTiItem(
		await assertScope(await requirePerm('leases', 'write'), input),
		input
	);
	getTiItems(input.leaseId).refresh();
	return row;
});

export const updateTiItem = command(tiItemUpdate, async (input) => {
	const row = await svc.updateTiItem(
		await assertScope(await requirePerm('leases', 'write'), input),
		input
	);
	getTiItems(row.leaseId).refresh();
	return row;
});

export const removeTiItem = command(idSchema, async (id) =>
	svc.deleteTiItem(await requirePerm('leases', 'write'), id)
);
