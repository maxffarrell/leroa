import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isEnterpriseEnabled } from '#lib/server/ee/license.ts';

export const load: LayoutServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/dashboard');
	return { enterprise: isEnterpriseEnabled() };
};
