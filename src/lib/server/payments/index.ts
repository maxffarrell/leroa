import { biltProvider } from './bilt.ts';
import { stripeProvider } from './stripe.ts';
import type { PaymentProvider } from './types.ts';

/** Online payment providers, in the order they are offered to tenants. */
export const providers: PaymentProvider[] = [stripeProvider, biltProvider];

const byId = new Map(providers.map((p) => [p.id, p]));

export const getProvider = (id: string) => byId.get(id);

export type { PaymentProvider } from './types.ts';
