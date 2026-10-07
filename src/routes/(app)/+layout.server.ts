import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getOrg } from '#lib/server/context.ts';
import { portalTenants } from '#lib/server/services/portal.ts';
import { ownerAccounts } from '#lib/server/services/owners.ts';
import { isDemo } from '#lib/server/demo-mode.ts';
import { isEnterpriseEnabled } from '#lib/server/ee/license.ts';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const ctx = await getOrg();
	if (!ctx) {
		if ((await portalTenants(locals.user.id)).length) redirect(303, '/portal');
		if ((await ownerAccounts(locals.user.id)).length) redirect(303, '/owner');
		redirect(303, '/onboarding');
	}
	return {
		user: {
			id: locals.user.id,
			name: locals.user.name,
			email: locals.user.email,
			image: locals.user.image ?? null
		},
		org: ctx.org,
		role: ctx.role,
		demo: isDemo(),
		enterprise: isEnterpriseEnabled()
	};
};
