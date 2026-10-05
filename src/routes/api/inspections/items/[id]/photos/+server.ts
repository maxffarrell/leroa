import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOrg } from '#lib/server/context.ts';
import { uploadItemPhotos } from '#lib/server/services/inspections.ts';

export const POST: RequestHandler = async ({ params, request }) => {
	const ctx = await requireOrg();
	const form = await request.formData();
	const files = form.getAll('file').filter((f): f is File => f instanceof File);
	if (!files.length) error(400, 'No file');
	return json(await uploadItemPhotos(ctx, params.id, files), { status: 201 });
};
