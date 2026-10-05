import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Building2 from '@lucide/svelte/icons/building-2';
import Users from '@lucide/svelte/icons/users';
import FileSignature from '@lucide/svelte/icons/file-signature';
import Wallet from '@lucide/svelte/icons/wallet';
import Wrench from '@lucide/svelte/icons/wrench';
import FolderOpen from '@lucide/svelte/icons/folder-open';
import Settings from '@lucide/svelte/icons/settings';
import Puzzle from '@lucide/svelte/icons/puzzle';
import Megaphone from '@lucide/svelte/icons/megaphone';
import HardHat from '@lucide/svelte/icons/hard-hat';

/** `key` is the second key of the `g <key>` keyboard shortcut. */
export const mainNav = [
	{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, key: 'd' },
	{ href: '/properties', label: 'Properties', icon: Building2, key: 'p' },
	{ href: '/tenants', label: 'Tenants', icon: Users, key: 't' },
	{ href: '/leasing', label: 'Leasing', icon: Megaphone, key: 'a' },
	{ href: '/leases', label: 'Leases', icon: FileSignature, key: 'l' },
	{ href: '/rent', label: 'Rent', icon: Wallet, key: 'r' },
	{ href: '/maintenance', label: 'Maintenance', icon: Wrench, key: 'm' },
	{ href: '/vendors', label: 'Vendors', icon: HardHat, key: 'v' },
	{ href: '/documents', label: 'Documents', icon: FolderOpen, key: 'o' }
] as const;

export const secondaryNav = [
	{ href: '/settings/integrations', label: 'Integrations', icon: Puzzle, key: 'i' },
	{ href: '/settings', label: 'Settings', icon: Settings, key: 's' }
] as const;

export const allNav = [...mainNav, ...secondaryNav];
