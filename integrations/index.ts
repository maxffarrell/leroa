// Validated integrations bundled with Leroa. New integrations are contributed
// via the public integrations repository and synced here after review.
import type { IntegrationDefinition } from '@leroa/integration-sdk';
import quickbooks from './quickbooks/index.ts';
import slack from './slack/index.ts';
import xero from './xero/index.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each integration has its own config shape
export const integrations: IntegrationDefinition<any>[] = [slack, quickbooks, xero];
