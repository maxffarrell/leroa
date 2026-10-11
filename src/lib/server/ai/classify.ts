/**
 * Document classification for the enterprise tier. Standalone module (no
 * service imports) so services/documents.ts can call it without cycles.
 */
import * as v from 'valibot';
import { chatJson } from './client.ts';
import { DOC_CATEGORIES, heuristicDocCategory, type DocCategory } from '#lib/ai/heuristics.ts';

export type { DocCategory };

export async function classifyDocument(name: string, contentType: string): Promise<DocCategory> {
	const ai = await chatJson(
		`You classify files uploaded to a property-management system into exactly one category. Categories: lease (lease/rental agreements, addenda, renewals), insurance (certificates of insurance, policies), tax (W-9, 1099, tax documents), invoice (invoices, receipts, statements), inspection (inspection reports, move-in/out checklists), photo (photos and scans of a property or damage), notice (notices to tenants, violations, demands), agreement (vendor contracts, proposals, estimates), other. Judge from the file name and type only.`,
		JSON.stringify({ name, contentType }),
		(raw) => {
			const r = v.safeParse(v.object({ category: v.picklist(DOC_CATEGORIES) }), raw);
			return r.success ? r.output.category : null;
		}
	);
	return ai ?? heuristicDocCategory(name, contentType);
}
