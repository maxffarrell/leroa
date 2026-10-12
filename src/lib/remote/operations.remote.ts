import { secureServices } from '#lib/server/access.ts';
import { inScope } from '#lib/remote/scope.ts';
import { command, query } from '$app/server';
import { requireOrg, requirePerm } from '#lib/server/context.ts';
import * as assetsRaw from '#lib/server/services/assets.ts';
import { assetsPolicy } from '#lib/server/access-policies.ts';
const assets = secureServices(assetsRaw, assetsPolicy);
import * as schedulesRaw from '#lib/server/services/schedules.ts';
import { schedulesPolicy } from '#lib/server/access-policies.ts';
const schedules = secureServices(schedulesRaw, schedulesPolicy);
import * as turnsRaw from '#lib/server/services/turns.ts';
import { turnsPolicy } from '#lib/server/access-policies.ts';
const turns = secureServices(turnsRaw, turnsPolicy);
import { assetInput, assetUpdate, idSchema, scheduleInput, scheduleUpdate } from '#lib/schemas.ts';
import { turnInput, turnUpdate } from '#lib/schemas.ts';

// Archived rows are returned too — views and pickers filter them client-side.
export const getAssets = query(async () =>
	inScope(
		await assets.listAssets((await requireOrg()).orgId, { includeArchived: true }),
		(await requireOrg()).propertyIds
	)
);
export const getAsset = query(idSchema, async (id) =>
	assets.getAsset((await requireOrg()).orgId, id)
);
export const createAsset = command(assetInput, async (input) => {
	const a = await assets.createAsset(await requirePerm('assets', 'write'), input);
	void getAssets().refresh();
	return a;
});
export const updateAsset = command(assetUpdate, async (input) => {
	const a = await assets.updateAsset(await requirePerm('assets', 'write'), input);
	void getAssets().refresh();
	void getAsset(input.id).refresh();
	return a;
});

export const getSchedules = query(async () => {
	const ctx = await requireOrg();
	return inScope(await schedules.listSchedules(ctx.orgId), ctx.propertyIds);
});
export const createSchedule = command(scheduleInput, async (input) => {
	const s = await schedules.createSchedule(await requirePerm('schedules', 'write'), input);
	void getSchedules().refresh();
	return s;
});
export const updateSchedule = command(scheduleUpdate, async (input) => {
	const s = await schedules.updateSchedule(await requirePerm('schedules', 'write'), input);
	void getSchedules().refresh();
	return s;
});
export const runScheduleNow = command(idSchema, async (id) => {
	const t = await schedules.runScheduleNow(await requirePerm('schedules', 'write'), id);
	void getSchedules().refresh();
	return t;
});

export const getTurns = query(async () => {
	const ctx = await requireOrg();
	return inScope(await turns.listTurns(ctx.orgId), ctx.propertyIds);
});
export const startTurn = command(turnInput, async (input) => {
	const t = await turns.startTurn(await requirePerm('turns', 'write'), input);
	void getTurns().refresh();
	return t;
});
export const updateTurn = command(turnUpdate, async (input) => {
	const t = await turns.updateTurn(await requirePerm('turns', 'write'), input);
	void getTurns().refresh();
	return t;
});
