import { redirect } from '@sveltejs/kit';
import { assertHub } from '#lib/server/profile/hub.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	assertHub();
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	return { user: { name: locals.user.name, email: locals.user.email } };
};
