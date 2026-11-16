import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$app/env/private', () => env);

beforeEach(() => {
	vi.resetModules();
	Object.assign(env, {
		AI_PROVIDER: undefined,
		AI_API_KEY: undefined,
		AI_MODEL: 'test-model',
		AI_BASE_URL: 'https://api.openai.com/v1',
		AI_DECISION_PROVIDER: undefined,
		AI_DECISION_API_KEY: undefined,
		AI_DECISION_MODEL: undefined,
		AI_DECISION_BASE_URL: undefined
	});
});
afterEach(() => vi.unstubAllGlobals());

describe('BYOK AI without a Cloud flag or enterprise key', () => {
	it('keeps an unconfigured provider unavailable', async () => {
		const ai = await import('./client.ts');
		expect(ai.aiConfigured()).toBe(false);
		expect(ai.decisionConfigured()).toBe(false);
	});

	it('uses a supplied provider key without any license entitlement', async () => {
		env.AI_API_KEY = 'provider-key';
		const fetchMock = vi
			.fn()
			.mockResolvedValue(Response.json({ choices: [{ message: { content: 'draft' } }] }));
		vi.stubGlobal('fetch', fetchMock);
		const ai = await import('./client.ts');
		expect(ai.aiConfigured()).toBe(true);
		expect(ai.decisionConfigured()).toBe(true);
		expect(await ai.chatText('system', 'hello')).toBe('draft');
		expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer provider-key');
	});

	it('supports an explicit keyless local endpoint without sending a bearer token', async () => {
		env.AI_BASE_URL = 'http://localhost:11434/v1';
		const fetchMock = vi
			.fn()
			.mockResolvedValue(Response.json({ choices: [{ message: { content: 'local draft' } }] }));
		vi.stubGlobal('fetch', fetchMock);
		const ai = await import('./client.ts');
		expect(ai.aiConfigured()).toBe(true);
		expect(await ai.chatText('system', 'hello')).toBe('local draft');
		expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
		expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('authorization');
	});

	it('can configure structured calls separately from freeform features', async () => {
		env.AI_DECISION_BASE_URL = 'http://localhost:11434/v1';
		env.AI_DECISION_MODEL = 'decision-model';
		const ai = await import('./client.ts');
		expect(ai.aiConfigured()).toBe(false);
		expect(ai.decisionConfigured()).toBe(true);
	});

	it('calls the Anthropic messages API when the provider is anthropic', async () => {
		env.AI_PROVIDER = 'anthropic';
		env.AI_API_KEY = 'sk-ant-test';
		env.AI_BASE_URL = undefined;
		env.AI_MODEL = undefined;
		const fetchMock = vi
			.fn()
			.mockResolvedValue(Response.json({ content: [{ type: 'text', text: 'claude draft' }] }));
		vi.stubGlobal('fetch', fetchMock);
		const ai = await import('./client.ts');
		expect(ai.aiConfigured()).toBe(true);
		expect(ai.decisionConfigured()).toBe(true);
		expect(await ai.chatText('system', 'hello')).toBe('claude draft');
		expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
		expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe('sk-ant-test');
		expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe('claude-sonnet-4-5');
	});
});
