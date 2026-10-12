import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requirePerm } from '#lib/server/context.ts';
import { runReport } from '#lib/server/services/reports.ts';
import { reportParams } from '#lib/schemas.ts';
import { toCsv, type CsvValue } from '#lib/csv.ts';
import { todayISO } from '#lib/format.ts';
import { matchesQuery, type ReportColumn, type ReportValue } from '#lib/reports.ts';

const num = (s: string | null) => (s ? Number(s) : undefined);

function exportValue(c: ReportColumn, value: ReportValue): CsvValue {
	if (value == null) return '';
	if (c.type === 'money' && typeof value === 'number') return (value / 100).toFixed(2);
	return value;
}

export const GET: RequestHandler = async ({ params, url }) => {
	const ctx = await requirePerm('reports');
	const q = url.searchParams;
	const parsed = v.safeParse(reportParams, {
		key: params.key,
		propertyId: q.get('propertyId') || undefined,
		days: num(q.get('days')),
		months: num(q.get('months')),
		from: q.get('from') || undefined,
		to: q.get('to') || undefined
	});
	if (!parsed.success) error(400, parsed.issues[0].message);
	const { key, ...rest } = parsed.output;
	const report = await runReport(ctx.orgId, key, rest, ctx);
	const columns = report.columns;
	const search = (q.get('q') ?? '').slice(0, 200).trim();
	const rows = search ? report.rows.filter((r) => matchesQuery(r, search)) : report.rows;
	const totals = search ? null : report.totals;
	const lines: CsvValue[][] = [
		columns.map((c) =>
			c.type === 'money' && report.currency ? `${c.label} (${report.currency})` : c.label
		),
		...rows.map((r) => columns.map((c) => exportValue(c, r[c.key] ?? null))),
		...(totals ? [columns.map((c) => exportValue(c, totals[c.key] ?? null))] : [])
	];
	const name = `${key}-${todayISO()}.csv`;
	return new Response(toCsv(lines), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${name}"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
