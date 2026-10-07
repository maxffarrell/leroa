import { AI_API_KEY, AI_BASE_URL, AI_MODEL } from '$app/env/private';

/**
 * Provider-agnostic OpenAI-compatible client. When AI_API_KEY is unset every
 * call returns null and the feature falls back to its local heuristic, so all
 * AI features work (deterministically) without any provider configured.
 */
export function aiConfigured(): boolean {
	return !!AI_API_KEY;
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

async function chat(messages: ChatMessage[], json: boolean): Promise<string | null> {
	if (!AI_API_KEY) return null;
	try {
		const res = await fetch(`${AI_BASE_URL.replace(/\/+$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${AI_API_KEY}`
			},
			signal: AbortSignal.timeout(30_000),
			body: JSON.stringify({
				model: AI_MODEL,
				temperature: 0.4,
				...(json ? { response_format: { type: 'json_object' } } : {}),
				messages
			})
		});
		if (!res.ok) return null;
		const data = (await res.json()) as {
			choices?: { message?: { content?: string } }[];
		};
		return data.choices?.[0]?.message?.content?.trim() || null;
	} catch {
		return null;
	}
}

export function chatText(system: string, user: string): Promise<string | null> {
	return chat(
		[
			{ role: 'system', content: system },
			{ role: 'user', content: user }
		],
		false
	);
}

export async function chatJson<T>(
	system: string,
	user: string,
	parse: (value: unknown) => T | null
): Promise<T | null> {
	const text = await chat(
		[
			{ role: 'system', content: `${system}\nRespond with a single JSON object only.` },
			{ role: 'user', content: user }
		],
		true
	);
	if (!text) return null;
	try {
		const start = text.indexOf('{');
		const end = text.lastIndexOf('}');
		if (start < 0 || end <= start) return null;
		return parse(JSON.parse(text.slice(start, end + 1)));
	} catch {
		return null;
	}
}
