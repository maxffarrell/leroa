import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOrg } from '#lib/server/context.ts';
import { hasFeature } from '#lib/server/ee/license.ts';
import { exportAudit } from '#lib/server/services/audit.ts';
import { toCsv, type CsvValue } from '#lib/csv.ts';
import { todayISO } from '#lib/format.ts';

export const GET: RequestHandler = async ({ url }) => {
	if (!hasFeature('audit_export')) error(403, 'Audit log export is part of the enterprise tier');
	const ctx = await requireOrg('admin');
	const q = url.searchParams;
	const DAY = /^\d{4}-\d{2}-\d{2}$/;
	for (const p of ['from', 'to']) {
		const s = q.get(p);
		if (s && !DAY.test(s)) error(400, `Invalid ${p} date`);
	}
	const rows = await exportAudit(ctx.orgId, {
		entityType: q.get('entityType') || undefined,
		action: q.get('action') || undefined,
		actorId: q.get('actorId') || undefined,
		q: q.get('q') || undefined,
		from: q.get('from') || undefined,
		to: q.get('to') || undefined
	});
	const lines: CsvValue[][] = [
		['Time (UTC)', 'Actor', 'Action', 'Entity type', 'Entity ID', 'Summary'],
		...rows.map((r) => [
			r.createdAt.toISOString(),
			r.actorName ?? '',
			r.action,
			r.entityType,
			r.entityId,
			r.summary
		])
	];
	return new Response(toCsv(lines), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="audit-log-${todayISO()}.csv"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
