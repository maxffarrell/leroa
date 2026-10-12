import type { ServicePolicy } from './access.ts';
import type * as portfolio from './services/portfolio.ts';
import type * as leasing from './services/leasing.ts';
import type * as maintenance from './services/maintenance.ts';
import type * as assets from './services/assets.ts';
import type * as schedules from './services/schedules.ts';
import type * as turns from './services/turns.ts';
import type * as inspections from './services/inspections.ts';
import type * as agreements from './services/agreements.ts';
import type * as commercial from './services/commercial.ts';
import type * as vendors from './services/vendors.ts';
import type * as owners from './services/owners.ts';
import type * as listings from './services/listings.ts';
import type * as crm from './services/crm.ts';
import type * as messaging from './services/messaging.ts';
import type * as residents from './services/residents.ts';

export const portfolioPolicy = {
	listProperties: {
		reads: ['units', 'tickets'],
		resource: 'properties',
		list: { entity: 'properties' }
	},
	getProperty: {
		reads: ['units', 'leases'],
		resource: 'properties',
		target: { entity: 'properties' }
	},
	createProperty: { resource: 'properties', action: 'write', references: true, globalWrite: true },
	updateProperty: {
		resource: 'properties',
		action: 'write',
		target: { entity: 'properties', key: 'id' },
		references: true
	},
	archiveProperty: {
		resource: 'properties',
		action: 'write',
		target: { entity: 'properties' },
		references: true
	},
	listUnits: { resource: 'units', list: { entity: 'units' } },
	createUnit: { resource: 'units', action: 'write', references: true },
	updateUnit: {
		resource: 'units',
		action: 'write',
		target: { entity: 'units', key: 'id' },
		references: true
	},
	deleteUnit: { resource: 'units', action: 'write', target: { entity: 'units' }, references: true },
	listTenants: { resource: 'tenants', list: { entity: 'tenants' } },
	getTenant: { context: true, resource: 'tenants', target: { entity: 'tenants' } },
	createTenant: { resource: 'tenants', action: 'write', references: true, globalWrite: true },
	updateTenant: {
		resource: 'tenants',
		action: 'write',
		target: { entity: 'tenants', key: 'id' },
		references: true
	},
	deleteTenant: {
		resource: 'tenants',
		action: 'write',
		target: { entity: 'tenants' },
		references: true
	}
} satisfies ServicePolicy<typeof portfolio>;

export const leasingPolicy = {
	listLeases: {
		reads: ['tenants', 'charges', 'payments'],
		resource: 'leases',
		list: { entity: 'leases' }
	},
	getLease: {
		reads: ['tenants', 'charges', 'payments'],
		resource: 'leases',
		target: { entity: 'leases' }
	},
	createLease: { resource: 'leases', action: 'write', references: true },
	updateLease: {
		resource: 'leases',
		action: 'write',
		target: { entity: 'leases', key: 'id' },
		references: true
	},
	ensureRentCharges: 'internal',
	runRentAutomation: 'internal',
	renewLease: {
		resource: 'leases',
		action: 'write',
		target: { entity: 'leases', key: 'id' },
		references: true
	},
	rentRoll: {
		reads: ['leases', 'tenants', 'payments'],
		resource: 'charges',
		list: { entity: 'charges' }
	},
	addCharge: { resource: 'charges', action: 'write', references: true },
	recordPayment: { resource: 'payments', action: 'write', references: true },
	deletePayment: {
		resource: 'payments',
		action: 'write',
		target: { entity: 'payments' },
		references: true
	},
	outer: 'internal'
} satisfies ServicePolicy<typeof leasing>;

export const maintenancePolicy = {
	listTickets: { resource: 'tickets', list: { entity: 'tickets' } },
	createTicket: { resource: 'tickets', action: 'write', references: true },
	applyTicketIntake: 'internal',
	updateTicket: {
		resource: 'tickets',
		action: 'write',
		target: { entity: 'tickets', key: 'id' },
		references: true
	},
	openTicketCount: 'internal',
	ticketActivity: { resource: 'tickets', target: { entity: 'tickets' } },
	addTicketNote: { resource: 'tickets', action: 'write', references: true },
	workOrderPath: { resource: 'tickets', target: { entity: 'tickets' }, action: 'write' },
	sendWorkOrder: {
		resource: 'tickets',
		action: 'write',
		target: { entity: 'tickets' },
		references: true
	}
} satisfies ServicePolicy<typeof maintenance>;

export const assetsPolicy = {
	listAssets: { context: true, resource: 'assets', list: { entity: 'assets' } },
	getAsset: { context: true, resource: 'assets', target: { entity: 'assets' } },
	assertAsset: 'internal',
	createAsset: { resource: 'assets', action: 'write', references: true },
	updateAsset: {
		resource: 'assets',
		action: 'write',
		target: { entity: 'assets', key: 'id' },
		references: true
	}
} satisfies ServicePolicy<typeof assets>;

export const schedulesPolicy = {
	listSchedules: { resource: 'schedules', list: { entity: 'schedules' } },
	createSchedule: { resource: 'schedules', action: 'write', references: true },
	updateSchedule: {
		resource: 'schedules',
		action: 'write',
		target: { entity: 'schedules', key: 'id' },
		references: true
	},
	runDueSchedules: 'internal',
	runScheduleNow: {
		resource: 'schedules',
		action: 'write',
		target: { entity: 'schedules' },
		references: true
	}
} satisfies ServicePolicy<typeof schedules>;

export const turnsPolicy = {
	listTurns: { resource: 'turns', list: { entity: 'turns' } },
	startTurn: { resource: 'turns', action: 'write', references: true },
	updateTurn: {
		resource: 'turns',
		action: 'write',
		target: { entity: 'turns', key: 'id' },
		references: true
	},
	autoStartTurn: 'internal',
	completeTurnsForUnit: 'internal',
	markTurnListed: 'internal'
} satisfies ServicePolicy<typeof turns>;

export const inspectionsPolicy = {
	listInspections: { resource: 'inspections', list: { entity: 'inspections' } },
	getInspection: { resource: 'inspections', target: { entity: 'inspections' } },
	createInspection: { resource: 'inspections', action: 'write', references: true },
	updateInspection: {
		resource: 'inspections',
		action: 'write',
		target: { entity: 'inspections', key: 'id' },
		references: true
	},
	deleteInspection: {
		resource: 'inspections',
		action: 'write',
		target: { entity: 'inspections' },
		references: true
	},
	addItem: { resource: 'inspections', action: 'write', references: true },
	updateItem: {
		resource: 'inspections',
		action: 'write',
		target: { entity: 'inspection_item', key: 'id' },
		references: true
	},
	deleteItem: {
		resource: 'inspections',
		action: 'write',
		target: { entity: 'inspection_item' },
		references: true
	},
	uploadItemPhotos: {
		resource: 'inspections',
		action: 'write',
		target: { entity: 'inspection_item' },
		references: true
	},
	completeInspection: {
		resource: 'inspections',
		action: 'write',
		target: { entity: 'inspections' },
		references: true
	},
	createRepairTicket: {
		resource: 'inspections',
		action: 'write',
		target: { entity: 'inspection_item' },
		references: true
	},
	portalInspections: 'internal',
	acknowledgeInspection: 'public',
	inspectionFile: 'internal'
} satisfies ServicePolicy<typeof inspections>;

export const agreementsPolicy = {
	listTemplates: { resource: 'leases' },
	saveTemplate: { resource: 'leases', action: 'write', references: true },
	deleteTemplate: { resource: 'leases', action: 'write' },
	mergeValues: 'internal',
	listAgreements: { resource: 'leases', target: { entity: 'leases' } },
	createAgreement: { resource: 'leases', action: 'write', references: true },
	updateAgreement: {
		resource: 'leases',
		action: 'write',
		target: { entity: 'agreement', key: 'id' },
		references: true
	},
	deleteDraft: {
		resource: 'leases',
		action: 'write',
		target: { entity: 'agreement' },
		references: true
	},
	sendAgreement: {
		resource: 'leases',
		action: 'write',
		target: { entity: 'agreement' },
		references: true
	},
	voidAgreement: {
		resource: 'leases',
		action: 'write',
		target: { entity: 'agreement' },
		references: true
	},
	portalAgreements: 'internal',
	signAgreement: 'public',
	agreementFile: 'internal'
} satisfies ServicePolicy<typeof agreements>;

export const commercialPolicy = {
	listClauses: { resource: 'leases', target: { entity: 'leases' } },
	addClause: { resource: 'leases', action: 'write', references: true },
	deleteClause: {
		resource: 'leases',
		action: 'write',
		target: { entity: 'clause' },
		references: true
	},
	listCriticalDates: { resource: 'leases', target: { entity: 'leases' } },
	addCriticalDate: { resource: 'leases', action: 'write', references: true },
	setCriticalDateDone: {
		resource: 'leases',
		action: 'write',
		target: { entity: 'critical_date' },
		references: true
	},
	deleteCriticalDate: {
		resource: 'leases',
		action: 'write',
		target: { entity: 'critical_date' },
		references: true
	},
	upcomingCriticalDates: { resource: 'leases', list: { entity: 'critical_date' } },
	listTiItems: { resource: 'leases', target: { entity: 'leases' } },
	addTiItem: { resource: 'leases', action: 'write', references: true },
	updateTiItem: {
		resource: 'leases',
		action: 'write',
		target: { entity: 'ti_item', key: 'id' },
		references: true
	},
	deleteTiItem: {
		resource: 'leases',
		action: 'write',
		target: { entity: 'ti_item' },
		references: true
	}
} satisfies ServicePolicy<typeof commercial>;

export const vendorsPolicy = {
	listVendors: { context: true, resource: 'vendors' },
	getVendor: { context: true, resource: 'vendors', target: { entity: 'vendors' } },
	createVendor: { resource: 'vendors', action: 'write', references: true },
	updateVendor: {
		resource: 'vendors',
		action: 'write',
		target: { entity: 'vendors', key: 'id' },
		references: true
	},
	assertVendor: 'internal'
} satisfies ServicePolicy<typeof vendors>;

export const ownersPolicy = {
	listOwners: { resource: 'owners', list: { entity: 'owners' } },
	getOwner: { reads: ['properties'], resource: 'owners', target: { entity: 'owners' } },
	propertyOwners: { resource: 'owners', target: { entity: 'properties' } },
	createOwner: { resource: 'owners', action: 'write', references: true },
	updateOwner: {
		resource: 'owners',
		action: 'write',
		target: { entity: 'owners', key: 'id' },
		references: true
	},
	ownerToken: 'public',
	claimOwner: 'internal',
	ownerAccounts: 'internal',
	ownerReport: {
		reads: ['properties', 'units', 'leases', 'tenants', 'charges', 'payments', 'tickets'],
		resource: 'owners',
		target: { entity: 'owners' }
	},
	ownerPortal: 'public'
} satisfies ServicePolicy<typeof owners>;

export const listingsPolicy = {
	listListings: { resource: 'listings', list: { entity: 'listings' } },
	getListing: { resource: 'listings', target: { entity: 'listings' } },
	createListing: { resource: 'listings', action: 'write', references: true },
	updateListing: {
		resource: 'listings',
		action: 'write',
		target: { entity: 'listings', key: 'id' },
		references: true
	},
	setListingStatus: {
		resource: 'listings',
		action: 'write',
		target: { entity: 'listings', key: 'id' },
		references: true
	},
	deleteListing: {
		resource: 'listings',
		action: 'write',
		target: { entity: 'listings' },
		references: true
	},
	publicListings: 'internal',
	publicListing: 'internal',
	listingPhoto: 'internal',
	submitApplication: 'public',
	listApplications: { resource: 'applications', list: { entity: 'applications' } },
	getApplication: { resource: 'applications', target: { entity: 'applications' } },
	updateApplication: {
		resource: 'applications',
		action: 'write',
		target: { entity: 'applications', key: 'id' },
		references: true
	},
	approveApplication: {
		resource: 'applications',
		action: 'write',
		target: { entity: 'applications', key: 'id' },
		references: true
	}
} satisfies ServicePolicy<typeof listings>;

export const crmPolicy = {
	listLeads: { resource: 'leads', list: { entity: 'leads' } },
	getLead: {
		reads: ['tours', 'applications', 'listings'],
		resource: 'leads',
		target: { entity: 'leads' }
	},
	createLead: { resource: 'leads', action: 'write', references: true },
	updateLead: {
		resource: 'leads',
		action: 'write',
		target: { entity: 'leads', key: 'id' },
		references: true
	},
	deleteLead: { resource: 'leads', action: 'write', target: { entity: 'leads' }, references: true },
	addLeadNote: { resource: 'leads', action: 'write', references: true },
	listTours: { resource: 'tours', list: { entity: 'tours' } },
	getTour: { resource: 'tours', target: { entity: 'tours' } },
	scheduleTour: { resource: 'tours', action: 'write', references: true },
	updateTour: {
		resource: 'tours',
		action: 'write',
		target: { entity: 'tours', key: 'id' },
		references: true
	},
	leasingAttention: { resource: 'leads', context: true },
	leasingBadge: { resource: 'leads', context: true },
	getLeasingSettings: {
		resource: 'tours',
		anyRead: ['leads', 'tours', 'listings', 'applications']
	},
	saveLeasingSettings: { resource: 'tours', action: 'write', references: true, globalWrite: true },
	initLeasingTimezone: { resource: 'tours', action: 'write', references: true, globalWrite: true },
	getPropertyMarketing: { resource: 'leads', target: { entity: 'properties' } },
	updatePropertyMarketing: {
		resource: 'leads',
		action: 'write',
		target: { entity: 'properties', key: 'id' },
		references: true
	},
	waitlistForListing: { resource: 'leads', target: { entity: 'listings' } },
	emailWaitlist: {
		resource: 'leads',
		action: 'write',
		target: { entity: 'listings' },
		references: true
	},
	leadFromApplication: 'internal',
	leadApplicationApproved: 'internal',
	publicProperties: 'internal',
	publicProperty: 'internal',
	publicTourSlots: 'public',
	submitInquiry: 'public',
	bookTour: 'public'
} satisfies ServicePolicy<typeof crm>;

export const messagingPolicy = {
	listThreads: { resource: 'messages', list: { entity: 'tenants', key: 'tenantId' } },
	unreadThreadCount: { resource: 'messages', context: true },
	getThread: { resource: 'messages', target: { entity: 'tenants' } },
	postMessage: 'internal',
	sendStaffMessage: { resource: 'messages', action: 'write', references: true },
	portalMessages: 'public',
	sendPortalMessage: 'public',
	announcementAudience: { resource: 'announcements', context: true },
	listAnnouncements: { resource: 'announcements', list: { entity: 'announcements' } },
	createAnnouncement: { resource: 'announcements', action: 'write', references: true },
	deleteAnnouncement: {
		resource: 'announcements',
		action: 'write',
		target: { entity: 'announcements' },
		references: true
	},
	portalAnnouncements: 'public',
	tenantMessageThreads: 'internal'
} satisfies ServicePolicy<typeof messaging>;

export const residentsPolicy = {
	listAmenities: { resource: 'properties', list: { entity: 'amenity' } },
	createAmenity: { resource: 'properties', action: 'write', references: true },
	deleteAmenity: {
		resource: 'properties',
		action: 'write',
		target: { entity: 'amenity' },
		references: true
	},
	listBookings: { resource: 'tenants', target: { entity: 'amenity' } },
	bookSlot: { resource: 'tenants', action: 'write', references: true },
	cancelBooking: {
		resource: 'tenants',
		action: 'write',
		target: { entity: 'booking' },
		references: true
	},
	listPackages: { resource: 'tenants', list: { entity: 'package' } },
	logPackage: { resource: 'tenants', action: 'write', references: true },
	markPickedUp: {
		resource: 'tenants',
		action: 'write',
		target: { entity: 'package' },
		references: true
	},
	pendingPackageCount: 'internal',
	listPermits: { resource: 'tenants', list: { entity: 'permit' } },
	issuePermit: { resource: 'tenants', action: 'write', references: true },
	revokePermit: {
		resource: 'tenants',
		action: 'write',
		target: { entity: 'permit' },
		references: true
	},
	listKeys: { resource: 'tenants', list: { entity: 'key' } },
	issueKey: { resource: 'tenants', action: 'write', references: true },
	closeKey: { resource: 'tenants', action: 'write', target: { entity: 'key' }, references: true },
	listPasses: { resource: 'tenants', list: { entity: 'pass' } },
	createPass: { resource: 'tenants', action: 'write', references: true },
	closePass: { resource: 'tenants', action: 'write', target: { entity: 'pass' }, references: true },
	listEvents: { resource: 'properties', list: { entity: 'event' } },
	createEvent: { resource: 'properties', action: 'write', references: true },
	cancelEvent: {
		resource: 'properties',
		action: 'write',
		target: { entity: 'event' },
		references: true
	},
	listSurveys: { resource: 'tenants', list: { entity: 'survey' } },
	listSurveyResponses: { resource: 'tenants', target: { entity: 'survey' } },
	createSurvey: { resource: 'tenants', action: 'write', references: true },
	closeSurvey: {
		resource: 'tenants',
		action: 'write',
		target: { entity: 'survey' },
		references: true
	},
	portalSurveys: 'internal',
	answerSurvey: 'internal'
} satisfies ServicePolicy<typeof residents>;
