import * as v from 'valibot';
import { command, query } from '$app/server';
import { requireUser } from '#lib/server/context.ts';
import { idSchema } from '#lib/schemas.ts';
import { profileData } from '#lib/profile.ts';
import {
	assertHub,
	getProfile,
	listGrants,
	revokeGrant,
	saveProfile
} from '#lib/server/profile/hub.ts';
import { disconnect, getLink, setTenantSync, syncLink } from '#lib/server/profile/client.ts';

// Profile service (hub) side.
export const getMyProfile = query(async () => {
	assertHub();
	return getProfile(requireUser().user.id);
});

export const saveMyProfile = command(profileData, async (data) => {
	assertHub();
	await saveProfile(requireUser().user.id, data);
	void getMyProfile().refresh();
});

export const getProfileGrants = query(async () => {
	assertHub();
	return listGrants(requireUser().user.id);
});

export const revokeProfileGrant = command(idSchema, async (id) => {
	assertHub();
	await revokeGrant(requireUser().user.id, id);
	void getProfileGrants().refresh();
});

// Install side.
export const getProfileLink = query(async () => getLink(requireUser().user.id));

export const setProfileSync = command(
	v.object({ tenantId: idSchema, on: v.boolean() }),
	async ({ tenantId, on }) => {
		await setTenantSync(requireUser().user.id, tenantId, on);
		void getProfileLink().refresh();
	}
);

export const syncProfileNow = command(async () => {
	const r = await syncLink(requireUser().user.id);
	void getProfileLink().refresh();
	return r;
});

export const disconnectProfile = command(async () => {
	await disconnect(requireUser().user.id);
	void getProfileLink().refresh();
});
