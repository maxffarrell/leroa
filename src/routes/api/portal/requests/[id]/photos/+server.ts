import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '#lib/server/context.ts';
import { portalRequestPhotos } from '#lib/server/services/portal.ts';

export const POST: RequestHandler = async ({ params, request }) => {
	const { user } = requireUser();
	const form = await request.formData();
	const files = form.getAll('file').filter((f): f is File => f instanceof File);
	if (!files.length) error(400, 'No file');
	return json({ added: await portalRequestPhotos(user.id, params.id, files) }, { status: 201 });
};
