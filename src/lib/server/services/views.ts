import { and, asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { savedView, user } from '#lib/server/db/schema.ts';

export async function listSavedViews(orgId: string, page: string) {
	return db
		.select({
			id: savedView.id,
			name: savedView.name,
			state: savedView.state,
			createdBy: savedView.createdBy,
			creatorName: user.name
		})
		.from(savedView)
		.leftJoin(user, eq(user.id, savedView.createdBy))
		.where(and(eq(savedView.organizationId, orgId), eq(savedView.page, page)))
		.orderBy(asc(savedView.name));
}

export async function saveView(
	orgId: string,
	userId: string,
	page: string,
	name: string,
	state: Record<string, unknown>
) {
	const [row] = await db
		.insert(savedView)
		.values({ organizationId: orgId, page, name, state, createdBy: userId })
		.returning({ id: savedView.id });
	return row!;
}

export async function deleteSavedView(
	orgId: string,
	id: string,
	by: { userId: string; admin: boolean }
) {
	await db
		.delete(savedView)
		.where(
			and(
				eq(savedView.id, id),
				eq(savedView.organizationId, orgId),
				by.admin ? undefined : eq(savedView.createdBy, by.userId)
			)
		);
}
