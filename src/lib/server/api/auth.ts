import { error, type RequestEvent } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.ts';
import { db } from '#lib/server/db/index.ts';
import type { OrgContext } from '#lib/server/context.ts';

/** Authenticates `Authorization: Bearer ks_…` against organization-scoped API keys. */
export async function apiContext(event: RequestEvent): Promise<OrgContext> {
	const header = event.request.headers.get('authorization') ?? '';
	const key = header.match(/^Bearer\s+(.+)$/i)?.[1] ?? event.request.headers.get('x-api-key');
	if (!key) error(401, 'Missing API key');

	const result = await auth.api.verifyApiKey({ body: { key } });
	if (!result.valid || !result.key) error(401, 'Invalid API key');

	const orgId = result.key.referenceId;
	const org = await db.query.organization.findFirst({ where: (o, { eq }) => eq(o.id, orgId) });
	if (!org) error(401, 'Invalid API key');

	// Attribute API writes to the key's creator, falling back to the workspace owner.
	const createdBy = (result.key.metadata as { createdBy?: string } | null)?.createdBy;
	const members = await db.query.member.findMany({
		where: (m, { eq }) => eq(m.organizationId, orgId)
	});
	const actor =
		members.find((m) => m.userId === createdBy) ??
		members.find((m) => m.role === 'owner') ??
		members[0];
	if (!actor) error(401, 'Invalid API key');

	return {
		userId: actor.userId,
		orgId,
		role: 'admin',
		org: { id: org.id, name: org.name, slug: org.slug, logo: org.logo ?? null }
	};
}
