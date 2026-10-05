import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startDemo } from '#lib/server/demo-mode.ts';

export const POST: RequestHandler = async (event) => {
	let ip = 'unknown';
	try {
		ip = event.getClientAddress();
	} catch {
		// Some adapters can't determine the client address.
	}
	await startDemo(ip);
	redirect(303, '/dashboard');
};
