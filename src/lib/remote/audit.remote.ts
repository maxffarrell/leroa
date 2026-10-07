import { query } from '$app/server';
import * as v from 'valibot';
import { requireOrg } from '#lib/server/context.ts';
import { auditCount, auditFacets, listAudit } from '#lib/server/services/audit.ts';
import { hasFeature } from '#lib/server/ee/license.ts';

const auditFilter = v.object({
	entityType: v.optional(v.string()),
	action: v.optional(v.string()),
	actorId: v.optional(v.string()),
	q: v.optional(v.string()),
	from: v.optional(v.pipe(v.string(), v.isoDate())),
	to: v.optional(v.pipe(v.string(), v.isoDate())),
	before: v.optional(v.string())
});

export const getAuditLog = query(auditFilter, async (f) => {
	const { orgId } = await requireOrg();
	const [{ rows, hasMore }, facets, total] = await Promise.all([
		listAudit(orgId, f),
		auditFacets(orgId),
		auditCount(orgId)
	]);
	return { rows, hasMore, facets, total, canExport: hasFeature('audit_export') };
});
