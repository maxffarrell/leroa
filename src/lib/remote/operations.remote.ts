import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import * as assets from '#lib/server/services/assets.ts';
import * as schedules from '#lib/server/services/schedules.ts';
import * as turns from '#lib/server/services/turns.ts';
import { assetInput, assetUpdate, idSchema, scheduleInput, scheduleUpdate } from '#lib/schemas.ts';
import { turnInput, turnUpdate } from '#lib/schemas.ts';

// Archived rows are returned too — views and pickers filter them client-side.
export const getAssets = query(async () =>
	assets.listAssets((await requireOrg()).orgId, { includeArchived: true })
);
export const getAsset = query(idSchema, async (id) =>
	assets.getAsset((await requireOrg()).orgId, id)
);
export const createAsset = command(assetInput, async (input) => {
	const a = await assets.createAsset(await requireOrg(), input);
	void getAssets().refresh();
	return a;
});
export const updateAsset = command(assetUpdate, async (input) => {
	const a = await assets.updateAsset(await requireOrg(), input);
	void getAssets().refresh();
	void getAsset(input.id).refresh();
	return a;
});

export const getSchedules = query(async () => schedules.listSchedules((await requireOrg()).orgId));
export const createSchedule = command(scheduleInput, async (input) => {
	const s = await schedules.createSchedule(await requireOrg(), input);
	void getSchedules().refresh();
	return s;
});
export const updateSchedule = command(scheduleUpdate, async (input) => {
	const s = await schedules.updateSchedule(await requireOrg(), input);
	void getSchedules().refresh();
	return s;
});
export const runScheduleNow = command(idSchema, async (id) => {
	const t = await schedules.runScheduleNow(await requireOrg(), id);
	void getSchedules().refresh();
	return t;
});

export const getTurns = query(async () => turns.listTurns((await requireOrg()).orgId));
export const startTurn = command(turnInput, async (input) => {
	const t = await turns.startTurn(await requireOrg(), input);
	void getTurns().refresh();
	return t;
});
export const updateTurn = command(turnUpdate, async (input) => {
	const t = await turns.updateTurn(await requireOrg(), input);
	void getTurns().refresh();
	return t;
});
