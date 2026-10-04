import { defineIntegration } from '@keystone/integration-sdk';

type Config = { webhookUrl: string; notifyPayments: boolean };

export default defineIntegration<Config>({
	id: 'slack',
	name: 'Slack',
	description: 'Post maintenance requests, new leases and payments to a Slack channel.',
	category: 'communication',
	author: { name: 'Keystone', url: 'https://github.com/keystone' },
	homepage: 'https://api.slack.com/messaging/webhooks',
	icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5ZM9 5a2 2 0 1 1 2-2v2H9Zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5Zm10 3a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 1 1-4 0V4a2 2 0 1 1 4 0v5Zm-3 10a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5Z"/></svg>',
	config: [
		{
			key: 'webhookUrl',
			label: 'Incoming webhook URL',
			type: 'secret',
			required: true,
			placeholder: 'https://hooks.slack.com/services/…'
		},
		{ key: 'notifyPayments', label: 'Notify on payments', type: 'boolean', default: true }
	],
	events: ['maintenance.created', 'lease.created', 'payment.recorded'],
	async handle(event, ctx) {
		if (event.type === 'payment.recorded' && !ctx.config.notifyPayments) return;
		await ctx.fetch(ctx.config.webhookUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ text: `*${ctx.workspace.name}* · ${event.summary}` })
		});
	}
});
