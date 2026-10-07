import { command, query } from '$app/server';
import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { requireOrg } from '#lib/server/context.ts';
import { FIELD_ENTITIES, FIELD_TYPES } from '#lib/schemas.ts';
import {
	archiveField,
	createField,
	listFields,
	recordFields,
	setFieldValue,
	updateField
} from '#lib/server/services/fields.ts';

const entity = v.picklist(FIELD_ENTITIES);
const fieldId = v.pipe(v.string(), v.minLength(1));

export const getFields = query(entity, async (e) => {
	const { orgId } = await requireOrg();
	// Include archived so admins can restore them; record views filter them out.
	return listFields(orgId, e, true);
});

export const getRecordFields = query(
	v.object({ entity, recordId: v.pipe(v.string(), v.minLength(1)) }),
	async ({ entity: e, recordId }) => {
		const { orgId } = await requireOrg();
		return recordFields(orgId, e, recordId);
	}
);

export const saveField = command(
	v.object({
		entity,
		id: v.optional(v.pipe(v.string(), v.minLength(1))),
		name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
		type: v.picklist(FIELD_TYPES),
		options: v.optional(v.array(v.pipe(v.string(), v.trim(), v.minLength(1))))
	}),
	async ({ entity: e, id, name, type, options }) => {
		const { orgId } = await requireOrg('admin');
		try {
			if (id) await updateField(orgId, id, { name, options });
			else await createField(orgId, { entity: e, name, type, options });
		} catch (err) {
			// Drizzle wraps PostgresError: the code sits on `cause`.
			const code = (err as { code?: string; cause?: { code?: string } }).code;
			const causeCode = (err as { cause?: { code?: string } }).cause?.code;
			if (code === '23505' || causeCode === '23505')
				error(
					409,
					`A field named “${name}” already exists on ${e === 'property' ? 'properties' : `${e}s`}`
				);
			throw err;
		}
		void getFields(e).refresh();
	}
);

export const setFieldArchived = command(
	v.object({ id: fieldId, entity, archived: v.boolean() }),
	async ({ id, entity: e, archived }) => {
		const { orgId } = await requireOrg('admin');
		await archiveField(orgId, id, archived);
		void getFields(e).refresh();
	}
);

export const writeFieldValue = command(
	v.object({
		entity,
		fieldId,
		recordId: v.pipe(v.string(), v.minLength(1)),
		value: v.nullable(v.pipe(v.string(), v.maxLength(500)))
	}),
	async ({ entity: e, fieldId: fId, recordId, value }) => {
		const { orgId } = await requireOrg();
		await setFieldValue(orgId, fId, recordId, value);
		void getRecordFields({ entity: e, recordId }).refresh();
	}
);
