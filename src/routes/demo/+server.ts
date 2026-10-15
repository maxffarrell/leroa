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
	const view = event.url.searchParams.get('view') === 'member' ? 'member' : 'staff';
	await startDemo(ip, view);
	redirect(303, view === 'member' ? '/portal' : '/dashboard');
};
