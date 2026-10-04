import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOrg } from '#lib/server/context.ts';
import { uploadDocument } from '#lib/server/services/documents.ts';

export const POST: RequestHandler = async ({ request }) => {
	const ctx = await requireOrg();
	const form = await request.formData();
	const files = form.getAll('file').filter((f): f is File => f instanceof File);
	if (!files.length) error(400, 'No file');
	const entityType = form.get('entityType');
	const entityId = form.get('entityId');
	const entity =
		typeof entityType === 'string' && typeof entityId === 'string' && entityType && entityId
			? { type: entityType, id: entityId }
			: undefined;
	const docs = [];
	for (const file of files) docs.push(await uploadDocument(ctx, file, entity));
	return json(docs, { status: 201 });
};
