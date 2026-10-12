import { canAccessRecord } from '#lib/server/access.ts';
import { allows } from '#lib/api-permissions.ts';
import type { OrgContext } from '#lib/server/context.ts';
import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { maintenanceTicket, property, tenant, unit, vendor } from '#lib/server/db/schema.ts';

export type SearchHit = {
	type: 'property' | 'unit' | 'tenant' | 'ticket' | 'vendor';
	id: string;
	title: string;
	subtitle: string;
	href: string;
};

export async function search(orgId: string, q: string, ctx?: OrgContext): Promise<SearchHit[]> {
	const term = `%${q.trim()}%`;
	if (q.trim().length < 1) return [];
	const [props, units, tenants, tickets, vendorRows] = await Promise.all([
		db
			.select({ id: property.id, name: property.name, city: property.city })
			.from(property)
			.where(
				and(
					eq(property.organizationId, orgId),
					isNull(property.archivedAt),
					or(
						ilike(property.name, term),
						ilike(property.addressLine1, term),
						ilike(property.city, term)
					)
				)
			)
			.limit(5),
		db
			.select({
				id: unit.id,
				name: unit.name,
				propertyId: property.id,
				propertyName: property.name
			})
			.from(unit)
			.innerJoin(property, eq(property.id, unit.propertyId))
			.where(
				and(
					eq(unit.organizationId, orgId),
					ilike(sql`${property.name} || ' ' || ${unit.name}`, term)
				)
			)
			.limit(5),
		db
			.select({
				id: tenant.id,
				kind: tenant.kind,
				firstName: tenant.firstName,
				lastName: tenant.lastName,
				companyName: tenant.companyName,
				email: tenant.email
			})
			.from(tenant)
			.where(
				and(
					eq(tenant.organizationId, orgId),
					or(
						ilike(sql`${tenant.firstName} || ' ' || ${tenant.lastName}`, term),
						ilike(tenant.companyName, term),
						ilike(tenant.email, term)
					)
				)
			)
			.limit(5),
		db
			.select({
				id: maintenanceTicket.id,
				number: maintenanceTicket.number,
				title: maintenanceTicket.title,
				status: maintenanceTicket.status
			})
			.from(maintenanceTicket)
			.where(
				and(
					eq(maintenanceTicket.organizationId, orgId),
					or(
						ilike(maintenanceTicket.title, term),
						sql`${maintenanceTicket.number}::text = ${q.replace('#', '').trim()}`
					)
				)
			)
			.limit(5),
		db
			.select({ id: vendor.id, name: vendor.name, trades: vendor.trades })
			.from(vendor)
			.where(
				and(
					eq(vendor.organizationId, orgId),
					isNull(vendor.archivedAt),
					or(ilike(vendor.name, term), ilike(vendor.contactName, term))
				)
			)
			.limit(5)
	]);
	const hits: SearchHit[] = [
		...props.map((p) => ({
			type: 'property' as const,
			id: p.id,
			title: p.name,
			subtitle: p.city,
			href: `/properties/${p.id}`
		})),
		...units.map((u) => ({
			type: 'unit' as const,
			id: u.id,
			title: `${u.propertyName} · ${u.name}`,
			subtitle: 'Unit',
			href: `/properties/${u.propertyId}?unit=${u.id}`
		})),
		...tenants.map((t) => ({
			type: 'tenant' as const,
			id: t.id,
			title:
				t.kind === 'company' && t.companyName
					? t.companyName
					: `${t.firstName} ${t.lastName}`.trim(),
			subtitle: t.email ?? 'Tenant',
			href: `/tenants/${t.id}`
		})),
		...tickets.map((t) => ({
			type: 'ticket' as const,
			id: t.id,
			title: `#${t.number} ${t.title}`,
			subtitle: t.status.replace('_', ' '),
			href: `/maintenance?ticket=${t.id}`
		})),
		...vendorRows.map((v) => ({
			type: 'vendor' as const,
			id: v.id,
			title: v.name,
			subtitle: v.trades.join(', ') || 'Vendor',
			href: `/vendors/${v.id}`
		}))
	];
	if (!ctx) return hits;
	const resources = {
		property: 'properties',
		unit: 'units',
		tenant: 'tenants',
		ticket: 'tickets',
		vendor: 'vendors'
	} as const;
	const visible = await Promise.all(
		hits.map(async (hit) => {
			const resource = resources[hit.type];
			if (ctx.perms && !allows(ctx.perms, resource, 'read')) return false;
			return canAccessRecord(ctx, resource, hit.id);
		})
	);
	return hits.filter((_, i) => visible[i]);
}
