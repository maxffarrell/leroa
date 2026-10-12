import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOrg } from '#lib/server/context.ts';
import { extractLeaseFields } from '#lib/server/ai/index.ts';
import { extractText } from 'unpdf';

const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** POST a lease PDF (FormData 'file'); get back extracted draft-lease fields. */
export const POST: RequestHandler = async ({ request }) => {
	await requireOrg();
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) error(400, 'No file');
	if (file.size > MAX_PDF_BYTES) error(400, 'PDF is too large (20 MB max)');
	const buf = new Uint8Array(await file.arrayBuffer());
	if (buf.slice(0, 5).join() !== '37,80,68,70,45') error(400, 'Not a PDF');
	const { text } = await extractText(buf, { mergePages: true }).catch(() => ({ text: '' }));
	if (!text.trim()) error(422, 'Could not read text from this PDF (scanned documents need OCR)');
	return json(await extractLeaseFields(text));
};
