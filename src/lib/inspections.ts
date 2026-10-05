import type { inspectionKinds, itemConditions } from '#lib/schemas.ts';

export type InspectionKind = (typeof inspectionKinds)[number];
export type Condition = (typeof itemConditions)[number];

export const KIND_LABEL: Record<InspectionKind, string> = {
	move_in: 'Move-in',
	move_out: 'Move-out',
	routine: 'Routine'
};

export const CONDITION_LABEL: Record<Condition, string> = {
	good: 'Good',
	fair: 'Fair',
	poor: 'Poor',
	damaged: 'Damaged',
	na: 'N/A'
};

const RANK: Partial<Record<Condition, number>> = { good: 0, fair: 1, poor: 2, damaged: 3 };

/** True when an item is in worse condition than at the earlier inspection. */
export function worsened(
	before: Condition | null | undefined,
	after: Condition | null | undefined
) {
	const a = before ? RANK[before] : undefined;
	const b = after ? RANK[after] : undefined;
	return a !== undefined && b !== undefined && b > a;
}

export const needsRepair = (c: Condition | null | undefined) => c === 'poor' || c === 'damaged';

const ROOMS: Record<string, string[]> = {
	Entry: ['Front door & locks', 'Walls & ceiling', 'Floor', 'Lights & switches'],
	'Living room': ['Walls & ceiling', 'Floor', 'Windows & blinds', 'Lights & outlets'],
	Kitchen: [
		'Cabinets & counters',
		'Sink & faucet',
		'Stove & oven',
		'Refrigerator',
		'Dishwasher',
		'Floor'
	],
	Bedroom: ['Walls & ceiling', 'Floor', 'Closet', 'Windows & blinds', 'Lights & outlets'],
	Bathroom: ['Toilet', 'Sink & vanity', 'Tub & shower', 'Floor', 'Exhaust fan'],
	General: [
		'Smoke detectors',
		'Carbon monoxide detector',
		'Heating & cooling',
		'Water heater',
		'Keys & remotes'
	]
};

const numbered = (name: string, n: number) =>
	Array.from({ length: n }, (_, i) => (n === 1 ? name : `${name} ${i + 1}`));

/** Starter checklist sized to the unit. A unit with 0 bedrooms is a studio. */
export function defaultChecklist(u: { bedrooms: number | null; bathrooms: number | null }) {
	const bedrooms = Math.min(u.bedrooms ?? 1, 8);
	const bathrooms = Math.min(Math.max(1, Math.ceil(u.bathrooms ?? 1)), 6);
	const areas: [string, string[]][] = [
		['Entry', ROOMS.Entry!],
		['Living room', ROOMS['Living room']!],
		['Kitchen', ROOMS.Kitchen!],
		...numbered('Bedroom', bedrooms).map((a): [string, string[]] => [a, ROOMS.Bedroom!]),
		...numbered('Bathroom', bathrooms).map((a): [string, string[]] => [a, ROOMS.Bathroom!]),
		['General', ROOMS.General!]
	];
	return areas.flatMap(([area, labels]) => labels.map((label) => ({ area, label })));
}

/** Groups items by area, keeping the order areas first appear in. */
export function groupByArea<T extends { area: string }>(items: T[]) {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const list = groups.get(item.area);
		if (list) list.push(item);
		else groups.set(item.area, [item]);
	}
	return [...groups].map(([area, items]) => ({ area, items }));
}

export const matchKey = (i: { area: string; label: string }) =>
	`${i.area.trim().toLowerCase()}\u0000${i.label.trim().toLowerCase()}`;
