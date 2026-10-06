import { startConnect } from '#lib/server/profile/client.ts';
import type { RequestHandler } from './$types';

/** "Fill from my Leroa profile" / "Connect your Leroa profile". */
export const GET: RequestHandler = (event) => startConnect(event);
