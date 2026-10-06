<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '#lib/auth-client.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Building from '@lucide/svelte/icons/building-2';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import SocialSignIn from '#lib/components/app/social-sign-in.svelte';

	let email = $state('');
	let password = $state('');
	let pending = $state(false);
	let showSso = $state(false);
	const next = $derived(page.url.searchParams.get('next') ?? '/dashboard');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		const { error } = await authClient.signIn.email({ email, password });
		pending = false;
		if (error) return toast.error(error.message ?? 'Could not sign in');
		await goto(next, { invalidateAll: true });
	}

	async function passkey() {
		const res = await authClient.signIn.passkey();
		if (res?.error) return toast.error(res.error.message ?? 'Passkey sign-in failed');
		await goto(next, { invalidateAll: true });
	}

	async function sso() {
		if (!email.includes('@')) return toast.error('Enter your work email first');
		const { error } = await authClient.signIn.sso({ email, callbackURL: next });
		if (error) toast.error(error.message ?? 'No SSO connection for this domain');
	}

	onMount(() => {
		const err = page.url.searchParams.get('error');
		if (err)
			toast.error(
				err === 'account_not_linked'
					? 'Sign in with your password first, then connect this account from the resident portal.'
					: 'Could not sign in with that account. Try again or use your email.'
			);
	});
</script>

<svelte:head><title>Sign in · Leroa</title></svelte:head>

{#if page.data.demo}
	<form method="POST" action="/demo" class="mb-8 space-y-3 rounded-xl border bg-muted/40 p-4">
		<div class="space-y-1">
			<h2 class="font-semibold">Try the live demo</h2>
			<p class="text-sm text-muted-foreground">
				Get a private sample portfolio with properties, tenants, leases, rent and maintenance. No
				sign-up. It's deleted after 24 hours.
			</p>
		</div>
		<Button type="submit" class="w-full"><Sparkles /> Open demo workspace</Button>
	</form>
{/if}

<form class="flex flex-col gap-6" onsubmit={submit}>
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight">Welcome back</h1>
		<p class="text-sm text-muted-foreground">Sign in to your workspace.</p>
	</div>
	{#if page.data.social?.length}
		<SocialSignIn
			providers={page.data.social}
			{next}
			newUserNext={page.url.searchParams.get('next') ?? '/onboarding'}
		/>
		<div class="flex items-center gap-3 text-xs text-muted-foreground">
			<Separator class="flex-1" /> or use email <Separator class="flex-1" />
		</div>
	{/if}
	<Field.Group>
		<Field.Field>
			<Field.Label for="email">Email</Field.Label>
			<Input
				id="email"
				type="email"
				autocomplete="email webauthn"
				required
				bind:value={email}
				autofocus
			/>
		</Field.Field>
		{#if !showSso}
			<Field.Field>
				<Field.Label for="password">Password</Field.Label>
				<Input
					id="password"
					type="password"
					autocomplete="current-password"
					required
					bind:value={password}
				/>
			</Field.Field>
			<Button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
		{:else}
			<Button type="button" onclick={sso}><Building /> Continue with SSO</Button>
		{/if}
	</Field.Group>
	{#if page.data.enterprise}
		<div class="flex items-center gap-3 text-xs text-muted-foreground">
			<Separator class="flex-1" /> or <Separator class="flex-1" />
		</div>
		<div class="grid gap-2">
			<Button type="button" variant="outline" onclick={passkey}
				><KeyRound /> Sign in with a passkey</Button
			>
			<Button type="button" variant="outline" onclick={() => (showSso = !showSso)}>
				<Building />
				{showSso ? 'Use a password instead' : 'Single sign-on (SAML / OIDC)'}
			</Button>
		</div>
	{/if}
	{#if !page.data.demo}<p class="text-center text-sm text-muted-foreground">
			New to Leroa? <a
				href="/signup{page.url.search}"
				class="font-medium text-foreground underline-offset-4 hover:underline">Create an account</a
			>
		</p>{/if}
</form>
