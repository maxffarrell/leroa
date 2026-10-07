import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { customField, customFieldValue } from '#lib/server/db/schema.ts';
import type { FieldEntity, FieldType } from '#lib/schemas.ts';

export async function listFields(orgId: string, entity: FieldEntity, includeArchived = false) {
	return db
		.select()
		.from(customField)
		.where(
			and(
				eq(customField.organizationId, orgId),
				eq(customField.entity, entity),
				includeArchived ? undefined : isNull(customField.archivedAt)
			)
		)
		.orderBy(asc(customField.position), asc(customField.name));
}

export async function createField(
	orgId: string,
	f: { entity: FieldEntity; name: string; type: FieldType; options?: string[] }
) {
	const [row] = await db
		.insert(customField)
		.values({
			organizationId: orgId,
			entity: f.entity,
			name: f.name,
			type: f.type,
			options: f.type === 'select' ? (f.options ?? []) : null
		})
		.returning({ id: customField.id });
	return row!;
}

export async function updateField(
	orgId: string,
	id: string,
	f: { name: string; options?: string[] }
) {
	await db
		.update(customField)
		.set({ name: f.name, options: f.options })
		.where(and(eq(customField.id, id), eq(customField.organizationId, orgId)));
}

export async function archiveField(orgId: string, id: string, archived: boolean) {
	await db
		.update(customField)
		.set({ archivedAt: archived ? new Date() : null })
		.where(and(eq(customField.id, id), eq(customField.organizationId, orgId)));
}

/** All active fields for an entity with this record's value (null when unset). */
export async function recordFields(orgId: string, entity: FieldEntity, recordId: string) {
	return db
		.select({
			id: customField.id,
			name: customField.name,
			type: customField.type,
			options: customField.options,
			value: customFieldValue.value
		})
		.from(customField)
		.leftJoin(
			customFieldValue,
			and(eq(customFieldValue.fieldId, customField.id), eq(customFieldValue.recordId, recordId))
		)
		.where(
			and(
				eq(customField.organizationId, orgId),
				eq(customField.entity, entity),
				isNull(customField.archivedAt)
			)
		)
		.orderBy(asc(customField.position), asc(customField.name));
}

export async function setFieldValue(
	orgId: string,
	fieldId: string,
	recordId: string,
	value: string | null
) {
	// Guard: the field must belong to this org.
	const [f] = await db
		.select({ id: customField.id })
		.from(customField)
		.where(and(eq(customField.id, fieldId), eq(customField.organizationId, orgId)))
		.limit(1);
	if (!f) return;
	await db
		.insert(customFieldValue)
		.values({ fieldId, recordId, value })
		.onConflictDoUpdate({
			target: [customFieldValue.fieldId, customFieldValue.recordId],
			set: { value, updatedAt: new Date() }
		});
}
