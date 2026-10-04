import * as v from 'valibot';
import { getRequestEvent, command, query } from '$app/server';
import { auth } from '#lib/server/auth.ts';
import { requireOrg } from '#lib/server/context.ts';

export const getApiKeys = query(async () => {
	const { orgId } = await requireOrg('admin');
	const res = await auth.api.listApiKeys({
		query: { organizationId: orgId },
		headers: getRequestEvent().request.headers
	});
	const keys = Array.isArray(res) ? res : ((res as { apiKeys?: unknown[] }).apiKeys ?? []);
	return (
		keys as {
			id: string;
			name: string | null;
			start: string | null;
			prefix: string | null;
			createdAt: Date;
			lastRequest: Date | null;
			expiresAt: Date | null;
		}[]
	).map((k) => ({
		id: k.id,
		name: k.name,
		start: k.start,
		prefix: k.prefix,
		createdAt: k.createdAt,
		lastRequest: k.lastRequest,
		expiresAt: k.expiresAt
	}));
});

export const createApiKey = command(
	v.object({ name: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(64)) }),
	async ({ name }) => {
		const { orgId, userId } = await requireOrg('admin');
		const key = await auth.api.createApiKey({
			body: { name, organizationId: orgId, metadata: { createdBy: userId } },
			headers: getRequestEvent().request.headers
		});
		void getApiKeys().refresh();
		return { key: key.key };
	}
);

export const deleteApiKey = command(v.string(), async (keyId) => {
	await requireOrg('admin');
	await auth.api.deleteApiKey({ body: { keyId }, headers: getRequestEvent().request.headers });
	void getApiKeys().refresh();
});
