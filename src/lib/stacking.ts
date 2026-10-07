/** Infer a floor and stack (column) from a unit name for stacking-plan views. */
export function parseStack(name: string): { floor: string; stack: string } {
	const m = name.trim().match(/^([A-Za-z]*)[\s-]*(\d+)([A-Za-z]*)$/);
	if (!m) return { floor: '—', stack: name.trim() };
	const [, pre, digits, post] = m;
	// 3+ digits: all but the last two are the floor ("1204" → floor 12, stack 04).
	const floor = digits.length > 2 ? digits.slice(0, -2) : digits;
	const stackDigits = digits.length > 2 ? digits.slice(-2) : '';
	return { floor, stack: `${pre}${stackDigits}${post}` || digits };
}

export type StackingUnit = {
	name: string;
	status: string;
	leaseEnd?: string | null;
};

export type StackCell = { unit: StackingUnit; tone: Tone };
export type StackRow = { floor: string; cells: (StackCell | null)[] };
export type Tone = 'occupied' | 'expiring' | 'notice' | 'vacant' | 'offline' | 'other';

const EXPIRING_DAYS = 90;

export function unitTone(u: StackingUnit, today: string): Tone {
	if (u.status === 'vacant') return 'vacant';
	if (u.status === 'offline') return 'offline';
	if (u.status === 'notice') return 'notice';
	if (u.status === 'occupied')
		return u.leaseEnd && u.leaseEnd <= addDays(today, EXPIRING_DAYS) ? 'expiring' : 'occupied';
	return 'other';
}

function addDays(iso: string, days: number) {
	return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}

// Highest floor first; the '—' (unstacked) row sorts last.
const floorKey = (f: string) => (f === '—' ? Infinity : -Number(f) || Infinity);

/** Group units into floor rows × stack columns, highest floor on top. */
export function buildStacking(units: StackingUnit[], today: string) {
	const stacks = new Set<string>();
	const byFloor = new Map<string, Map<string, StackingUnit>>();
	for (const u of units) {
		const { floor, stack } = parseStack(u.name);
		stacks.add(stack);
		let row = byFloor.get(floor);
		if (!row) byFloor.set(floor, (row = new Map()));
		row.set(stack, u);
	}
	const columns = [...stacks].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	const rows: StackRow[] = [...byFloor.entries()]
		.sort(([a], [b]) => floorKey(a) - floorKey(b))
		.map(([floor, cells]) => ({
			floor,
			cells: columns.map((s) => {
				const u = cells.get(s);
				return u ? { unit: u, tone: unitTone(u, today) } : null;
			})
		}));
	return { columns, rows };
}
