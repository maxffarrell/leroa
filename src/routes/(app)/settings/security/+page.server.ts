import type { PageServerLoad } from './$types';
import { isEnterpriseEnabled } from '#lib/server/ee/license.ts';

export const load: PageServerLoad = () => ({ enterprise: isEnterpriseEnabled() });
