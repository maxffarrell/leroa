import {
	AI_API_KEY,
	AI_BASE_URL,
	AI_DECISION_API_KEY,
	AI_DECISION_BASE_URL,
	AI_DECISION_MODEL,
	AI_DECISION_PROVIDER,
	AI_MODEL,
	AI_PROVIDER
} from '$app/env/private';

/**
 * Provider-agnostic client — OpenAI-compatible `/chat/completions` or Anthropic
 * `/v1/messages`, selected by `AI_PROVIDER` (`openai` default | `anthropic`).
 * Without a configured provider,
 * every call returns null and the feature falls back to its local heuristic,
 * so all AI features work (deterministically) without any provider configured.
 *
 * Two providers share this client:
 * - feature (`AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL`): generative features —
 *   assistant, drafting, summaries, extraction, classification.
 * - decision (`AI_DECISION_*`): the structured snap decisions in decisions.ts.
 *   Each `AI_DECISION_*` var falls back to its `AI_*` counterpart when unset,
 *   so a single-key install drives both — set them to route decisions at a
 *   different (e.g. cheaper/faster) provider or model.
 */
type Provider = {
	api: 'openai' | 'anthropic';
	apiKey: string | undefined;
	baseUrl: string;
	model: string;
};

const OPENAI_DEFAULT = 'https://api.openai.com/v1';
const ANTHROPIC_DEFAULT = 'https://api.anthropic.com';

const featureApi = (
	AI_PROVIDER?.toLowerCase() === 'anthropic' ? 'anthropic' : 'openai'
) as Provider['api'];
const feature: Provider = {
	api: featureApi,
	apiKey: AI_API_KEY,
	baseUrl: AI_BASE_URL ?? (featureApi === 'anthropic' ? ANTHROPIC_DEFAULT : OPENAI_DEFAULT),
	model: AI_MODEL ?? (featureApi === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini')
};
const decisionApi = (
	AI_DECISION_PROVIDER
		? AI_DECISION_PROVIDER.toLowerCase() === 'anthropic'
			? 'anthropic'
			: 'openai'
		: featureApi
) as Provider['api'];
const decision: Provider = {
	api: decisionApi,
	apiKey: AI_DECISION_API_KEY ?? (decisionApi === featureApi ? AI_API_KEY : undefined),
	baseUrl:
		AI_DECISION_BASE_URL ??
		(decisionApi === featureApi
			? feature.baseUrl
			: decisionApi === 'anthropic'
				? ANTHROPIC_DEFAULT
				: OPENAI_DEFAULT),
	model:
		AI_DECISION_MODEL ??
		(decisionApi === featureApi
			? feature.model
			: decisionApi === 'anthropic'
				? 'claude-sonnet-4-5'
				: 'gpt-4o-mini')
};

function configured(provider: Provider): boolean {
	const base = provider.baseUrl.replace(/\/+$/, '');
	const isDefault = base === (provider.api === 'anthropic' ? ANTHROPIC_DEFAULT : OPENAI_DEFAULT);
	return !!(provider.model && (provider.apiKey || !isDefault));
}

export function aiConfigured(): boolean {
	return configured(feature);
}

export function decisionConfigured(): boolean {
	return configured(decision);
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

async function anthropicChat(provider: Provider, messages: ChatMessage[]): Promise<string | null> {
	const res = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/v1/messages`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': provider.apiKey ?? '',
			'anthropic-version': '2023-06-01'
		},
		signal: AbortSignal.timeout(30_000),
		body: JSON.stringify({
			model: provider.model,
			max_tokens: 4096,
			temperature: 0.4,
			system: messages.find((m) => m.role === 'system')?.content,
			messages: messages.filter((m) => m.role !== 'system')
		})
	});
	if (!res.ok) return null;
	const data = (await res.json()) as { content?: { type: string; text?: string }[] };
	return data.content?.find((b) => b.type === 'text')?.text?.trim() || null;
}

async function chat(
	provider: Provider,
	messages: ChatMessage[],
	json: boolean
): Promise<string | null> {
	if (!configured(provider)) return null;
	try {
		if (provider.api === 'anthropic') return await anthropicChat(provider, messages);
		const res = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {})
			},
			signal: AbortSignal.timeout(30_000),
			body: JSON.stringify({
				model: provider.model,
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
		feature,
		[
			{ role: 'system', content: system },
			{ role: 'user', content: user }
		],
		false
	);
}

export function decisionChatText(system: string, user: string): Promise<string | null> {
	return chat(
		decision,
		[
			{ role: 'system', content: system },
			{ role: 'user', content: user }
		],
		false
	);
}

async function json<T>(
	provider: Provider,
	system: string,
	user: string,
	parse: (value: unknown) => T | null
): Promise<T | null> {
	const text = await chat(
		provider,
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

export function chatJson<T>(
	system: string,
	user: string,
	parse: (value: unknown) => T | null
): Promise<T | null> {
	return json(feature, system, user, parse);
}

export function decisionChatJson<T>(
	system: string,
	user: string,
	parse: (value: unknown) => T | null
): Promise<T | null> {
	return json(decision, system, user, parse);
}
