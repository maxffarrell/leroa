import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/commercial.ts';
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
	const row = await svc.addClause(await requireOrg(), input);
	getClauses(input.leaseId).refresh();
	return row;
});

export const removeClause = command(idSchema, async (id) =>
	svc.deleteClause(await requireOrg(), id)
);

export const addCriticalDate = command(criticalDateInput, async (input) => {
	const row = await svc.addCriticalDate(await requireOrg(), input);
	getCriticalDates(input.leaseId).refresh();
	getUpcomingDates().refresh();
	return row;
});

export const setDateDone = command(criticalDateDoneInput, async (input) => {
	const row = await svc.setCriticalDateDone(await requireOrg(), input.id, input.done);
	getCriticalDates(row.leaseId).refresh();
	getUpcomingDates().refresh();
	return row;
});

export const removeCriticalDate = command(idSchema, async (id) =>
	svc.deleteCriticalDate(await requireOrg(), id)
);

export const getTiItems = query(idSchema, async (leaseId) =>
	svc.listTiItems((await requireOrg()).orgId, leaseId)
);

export const addTiItem = command(tiItemInput, async (input) => {
	const row = await svc.addTiItem(await requireOrg(), input);
	getTiItems(input.leaseId).refresh();
	return row;
});

export const updateTiItem = command(tiItemUpdate, async (input) => {
	const row = await svc.updateTiItem(await requireOrg(), input);
	getTiItems(row.leaseId).refresh();
	return row;
});

export const removeTiItem = command(idSchema, async (id) =>
	svc.deleteTiItem(await requireOrg(), id)
);
