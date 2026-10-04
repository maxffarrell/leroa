/* @license Enterprise */

import { KEYSTONE_CLOUD, KEYSTONE_ENTERPRISE_KEY } from '$app/env/private';

export type EnterpriseFeature = 'sso' | 'passkeys';

/**
 * Enterprise features are enabled on Keystone Cloud, or on self-hosted installs
 * with a license key. Key validation is intentionally minimal until the license
 * server exists; see ee/README.md.
 */
export function isEnterpriseEnabled(): boolean {
	return KEYSTONE_CLOUD === true || !!KEYSTONE_ENTERPRISE_KEY;
}

export function hasFeature(_feature: EnterpriseFeature): boolean {
	return isEnterpriseEnabled();
}
