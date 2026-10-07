import { command, query } from '$app/server';
import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { requireOrg } from '#lib/server/context.ts';
import { deleteSavedView, listSavedViews, saveView } from '#lib/server/services/views.ts';

const pageKey = v.pipe(v.string(), v.minLength(1), v.maxLength(40));
const viewState = v.record(v.string(), v.unknown());

export const getSavedViews = query(pageKey, async (page) => {
	const { orgId } = await requireOrg();
	return listSavedViews(orgId, page);
});

// Drizzle wraps PostgresError: the code sits on `cause`, not the thrown error.
const isUniqueViolation = (e: unknown) =>
	(e as { code?: string; cause?: { code?: string } }).code === '23505' ||
	(e as { cause?: { code?: string } }).cause?.code === '23505';

export const saveViewAs = command(
	v.object({
		page: pageKey,
		name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
		state: viewState
	}),
	async ({ page, name, state }) => {
		const { orgId, userId } = await requireOrg();
		const row = await saveView(orgId, userId, page, name, state).catch((e) => {
			if (isUniqueViolation(e)) error(409, `A view named “${name}” already exists`);
			throw e;
		});
		void getSavedViews(page).refresh();
		return row;
	}
);

export const deleteView = command(v.pipe(v.string(), v.minLength(1)), async (id) => {
	const { orgId, userId, role } = await requireOrg();
	// Only the creator or an owner/admin may delete.
	await deleteSavedView(orgId, id, { userId, admin: role !== 'member' });
});
