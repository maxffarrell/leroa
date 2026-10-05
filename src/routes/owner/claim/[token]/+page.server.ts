import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { claimOwner } from '#lib/server/services/owners.ts';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) redirect(303, `/signup?next=${encodeURIComponent(url.pathname)}`);
	await claimOwner(params.token, locals.user.id);
	redirect(303, '/owner');
};
