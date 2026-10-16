import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadWorkOrderPhotos, validateWorkOrderLink } from '#lib/server/services/work-orders.ts';

export const POST: RequestHandler = async ({ params, request }) => {
	await validateWorkOrderLink(params.token);
	const form = await request.formData();
	const files = form.getAll('file').filter((f): f is File => f instanceof File);
	if (!files.length) error(400, 'No file');
	return json({ added: await uploadWorkOrderPhotos(params.token, files) }, { status: 201 });
};
