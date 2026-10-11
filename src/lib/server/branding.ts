import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { organization } from '#lib/server/db/schema.ts';

/**
 * Resident-facing brand for a workspace: the portal display name wins over the
 * workspace name, plus the accent color. Service-free so any module can use it.
 */
export async function orgBrand(orgId: string) {
	const [o] = await db
		.select({
			name: organization.name,
			portalTitle: organization.portalTitle,
			accent: organization.accentColor
		})
		.from(organization)
		.where(eq(organization.id, orgId));
	return {
		name: o?.portalTitle ?? o?.name ?? 'Your property manager',
		accent: o?.accent ?? null
	};
}
