import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import {
	deleteDocument as remove,
	listAuthorizedDocuments
} from '#lib/server/services/documents.ts';
import { idSchema } from '#lib/schemas.ts';

export const getDocuments = query(async () => listAuthorizedDocuments(await requireOrg()));
export const deleteDocument = command(idSchema, async (id) => {
	await remove(await requireOrg(), id);
	void getDocuments().refresh();
});
