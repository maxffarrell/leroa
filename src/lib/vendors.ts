import { addDays } from './format.ts';

export type InsuranceState = 'missing' | 'expired' | 'expiring' | 'ok';

/** Certificates expiring within this many days are flagged. */
export const INSURANCE_WARNING_DAYS = 30;

export function insuranceState(expiresOn: string | null, today: string): InsuranceState {
	if (!expiresOn) return 'missing';
	if (expiresOn < today) return 'expired';
	if (expiresOn <= addDays(today, INSURANCE_WARNING_DAYS)) return 'expiring';
	return 'ok';
}
