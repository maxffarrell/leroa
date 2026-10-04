import { sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';

export const GET = async () => {
	await db.execute(sql`select 1`);
	return new Response('ok', { headers: { 'cache-control': 'no-store' } });
};
