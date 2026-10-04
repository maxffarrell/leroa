/** Expands "101-103, A, B" into ["101", "102", "103", "A", "B"]. Ranges are capped at 500 units. */
export function expandUnits(text: string): string[] {
	const out: string[] = [];
	for (const part of text.split(/[,\n]/)) {
		const token = part.trim();
		if (!token) continue;
		const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
		if (range) {
			const [a, b] = [Number(range[1]), Number(range[2])];
			if (b >= a && b - a < 500) {
				for (let i = a; i <= b; i++) out.push(String(i).padStart(range[1]!.length, '0'));
				continue;
			}
		}
		out.push(token);
	}
	return [...new Set(out)].slice(0, 500);
}
