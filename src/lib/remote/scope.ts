/** Filters a service list to the member's property scope (null scope = all rows). */
export function inScope<T>(
	rows: T[],
	propertyIds: string[] | null,
	key: keyof T = 'propertyId' as keyof T
): T[] {
	if (!propertyIds) return rows;
	const allowed = new Set(propertyIds);
	return rows.filter((r) => allowed.has(r[key] as string));
}
