/**
 * Natural-key references into the data created by
 * waqfnami/database/seeders/E2EFixtureSeeder.php (+ E2ETestAdminSeeder.php
 * for the login account). Tests look things up by these human-readable
 * identifiers - the same way a person would search the UI - rather than by
 * database id, since ids aren't stable across reseeds.
 *
 * Keep this file in sync with the seeders. Shared fixture password for every
 * seeded client/provider/team-member below: "E2eTest#12345".
 */
export const testData = {
  admin: {
    email: "e2e-admin@waqf.test",
  },

  fixturePassword: "E2eTest#12345",

  clients: {
    // `name`/`waqfName` below are additive lookups confirmed against the
    // running fixture (database/seeders/E2EFixtureSeeder.php's $clients list
    // + a direct GET /admin/clients check). `hasInvoice`/`hasWalletBalance`
    // record which alwaqf detail tabs actually have non-empty data, per
    // seedPaymentsAndInvoices() only ever attaching its "completed_with_invoice"
    // payment to clients[0] - look the row up by name in the UI (e.g. via the
    // list search), never by a hardcoded id, since ids aren't stable across a reseed.
    active: {
      email: "e2e-client-1@waqf.test",
      status: "active",
      name: "E2E Client One",
      waqfName: "وقف الاختبار الأول",
      hasInvoice: true,
      hasWalletBalance: true,
    },
    active2: {
      email: "e2e-client-2@waqf.test",
      status: "active",
      name: "E2E Client Two",
      waqfName: "وقف الاختبار الثاني",
      hasInvoice: false,
      hasWalletBalance: true,
    },
    review: {
      email: "e2e-client-3@waqf.test",
      status: "review",
      name: "E2E Client Three",
      waqfName: "وقف الاختبار الثالث",
      hasInvoice: false,
      hasWalletBalance: true,
    },
    inactive: {
      email: "e2e-client-4@waqf.test",
      status: "inactive",
      name: "E2E Client Four",
      waqfName: "وقف الاختبار الرابع",
      hasInvoice: false,
      hasWalletBalance: false,
    },
    stopped: {
      email: "e2e-client-5@waqf.test",
      status: "stop",
      name: "E2E Client Five",
      waqfName: "وقف الاختبار الخامس",
      hasInvoice: false,
      hasWalletBalance: false,
    },
  },

  providers: {
    // Counts below are additive facts confirmed against
    // E2EFixtureSeeder.php's seedServices/seedServiceRequestsAndQuotations/
    // seedConsultations/seedPaymentsAndInvoices/seedWalletsAndWithdrawals:
    // service requests, consultations, invoices and withdrawals are only
    // ever attached to providers[0] ("active") - the other 3 teams only get
    // 2 services each (from the 8-status service round-robin) plus an empty
    // (but real, non-zero-balance) wallet with no withdrawals.
    active: {
      teamName: "E2E Provider One - Active",
      ownerEmail: "e2e-provider-1@waqf.test",
      // Wallet/withdrawal API responses (admin/withdrawals, admin/wallet)
      // render the wallet owner's *user* name here, not the team's
      // business_name - confirmed via a direct GET /admin/withdrawals check.
      ownerName: "E2E Provider One Owner",
      status: "active",
      isConsultant: true,
      isWaqfMarket: true,
      servicesCount: 4, // draft, revision_pending, approved_extra_1, approved_extra_2
      serviceRequestsCount: 9, // one per ServiceRequestStatusEnum
      consultationsCount: 7, // one per ConsultationStatusEnum
      invoicesCount: 1, // completed_with_invoice
      withdrawalsCount: 3, // one per WithdrawalsStatus (pending/complete/rejected)
    },
    pending: {
      teamName: "E2E Provider Two - Pending",
      ownerEmail: "e2e-provider-2@waqf.test",
      status: "review",
      servicesCount: 2, // pending, inactive
    },
    suspended: {
      teamName: "E2E Provider Three - Suspended",
      ownerEmail: "e2e-provider-3@waqf.test",
      status: "stop",
      servicesCount: 2, // approved, hold
    },
    incomplete: {
      teamName: "E2E Provider Four - Incomplete",
      ownerEmail: "e2e-provider-4@waqf.test",
      status: "incomplete",
      isConsultant: true,
      // Seeded with 2 services (rejected, removed), but
      // ProviderService::services() applies ServiceService's default
      // "visible" scope (status != removed), so only 1 is ever visible
      // through the admin API/UI.
      servicesCount: 1,
    },
    /** Team member email pattern: e2e-provider-{1-4}-{sales|consultant|accountant}@waqf.test */
    memberEmail: (teamNumber: 1 | 2 | 3 | 4, role: "sales" | "consultant" | "accountant") =>
      `e2e-provider-${teamNumber}-${role}@waqf.test`,
  },

  services: {
    approved1: { title: "E2E Approved Service 1", status: "approved" },
    approved2: { title: "E2E Approved Service 2", status: "approved" },
    byStatus: {
      draft: "E2E Service - draft",
      pending: "E2E Service - pending",
      approved: "E2E Service - approved",
      rejected: "E2E Service - rejected",
      revision_pending: "E2E Service - revision_pending",
      inactive: "E2E Service - inactive",
      hold: "E2E Service - hold",
      removed: "E2E Service - removed",
    },
    // Additive facts confirmed against E2EFixtureSeeder.php's seedServices()
    // (round-robins ServiceTypeEnum::PACKAGE for i%3===0, i.e. draft/rejected/
    // hold) + ServiceController@index's `scopes: ['notDraft']`, which hides
    // draft services from the admin service-management list entirely:
    // - type=service, non-draft: pending, approved, revision_pending,
    //   inactive, removed, approved_extra_1, approved_extra_2 = 7 rows.
    // - type=package, non-draft: rejected, hold = 2 rows (draft is also a
    //   package, but never shows up here since it's filtered out first).
    serviceTypeVisibleCount: 7,
    packageTypeVisibleCount: 2,
    // seedFields()'s real Field rows - the service-management list's "مجال
    // الخدمة/الباقة" filter dropdown hardcodes unrelated options
    // (healthcare/education/technology/social) instead of these real,
    // seeded field names/ids, so selecting any of them can never match a
    // real field_id and always yields zero results.
    realFieldNames: ["إدارة أملاك", "أعمال قانونية", "أعمال محاسبية"],
  },

  serviceRequests: {
    /** description text = `E2E service request in status {status}` */
    statuses: [
      "pending",
      "quoted",
      "under_negotiation",
      "pending_transfer_verification",
      "in_progress",
      "scheduled",
      "completed",
      "rejected",
      "cancelled",
    ],
    descriptionFor: (status: string) => `E2E service request in status ${status}`,
    // Additive facts confirmed against
    // E2EFixtureSeeder.php's seedServiceRequestsAndQuotations(), which
    // alternates the 9 status-ordered requests between the 2 "approved_extra"
    // services by index parity (i%2===0 => approved_extra_1):
    // pending(0), quoted(1), under_negotiation(2), pending_transfer_verification(3),
    // in_progress(4), scheduled(5), completed(6), rejected(7), cancelled(8).
    statusesForApprovedService1: [
      "pending",
      "under_negotiation",
      "in_progress",
      "completed",
      "cancelled",
    ],
    statusesForApprovedService2: [
      "quoted",
      "pending_transfer_verification",
      "scheduled",
      "rejected",
    ],
    // Every non-pending status gets a Quotation row (quotations.length >= 1),
    // but only the "completed" request's quotation ever has real PaymentItem/
    // Invoice data attached (seedPaymentsAndInvoices() hardcodes all 6 seeded
    // payments onto `$quotations[ServiceRequestStatusEnum::COMPLETED->value]`)
    // - so it's the only request whose "التكلفة"/"طريقة الدفع"/"الفاتورة"
    // fields on the details page ever show real (non "--") values.
    statusWithoutQuotation: "pending",
    statusWithRealAccounting: "completed",
  },

  consultations: {
    statuses: [
      "pending",
      "scheduled",
      "rejected",
      "cancelled",
      "pending_quotations",
      "quotations_sent",
      "closed", // replaced "completed" in waqfnami's consultation lifecycle refactor
    ],
  },

  payments: {
    completedWithInvoice: {
      note: "E2E payment fixture: completed_with_invoice",
      status: "completed",
      method: "visa",
    },
    pendingPayment: {
      note: "E2E payment fixture: pending_payment",
      status: "pending_payment",
      method: "bank_transfer",
    },
    pendingVerification: {
      note: "E2E payment fixture: pending_verification",
      status: "pending_verification",
      method: "bank_transfer",
    },
    rejected: {
      note: "E2E payment fixture: rejected",
      status: "rejected",
      method: "mada",
    },
    failed: {
      note: "E2E payment fixture: failed",
      status: "failed",
      method: "master",
    },
    completedNoInvoice: {
      note: "E2E payment fixture: completed_no_invoice",
      status: "completed",
      method: "wallet",
    },
  },

  bankTransfers: {
    pending: { senderName: "E2E Sender Pending", status: "pending" },
    verified: { senderName: "E2E Sender Verified", status: "verified" },
    rejected: { senderName: "E2E Sender Rejected", status: "rejected" },
  },

  withdrawals: {
    // All 3 share the same amount (200) and owner (providers.active) -
    // confirmed via a direct GET /admin/withdrawals check.
    pending: { note: "E2E withdrawal fixture (pending)", amount: 200 },
    complete: { note: "E2E withdrawal fixture (complete)", amount: 200 },
    rejected: { note: "E2E withdrawal fixture (rejected)", amount: 200 },
  },

  wallet: {
    clientTransactionDescriptions: [
      "E2E client wallet purchase #1",
      "E2E client wallet refund #1",
    ],
    providerTransactionDescriptions: [
      "E2E provider earnings #1",
      "E2E provider payout released #1",
    ],
    bankAccountLabel: "E2E Test Bank",
    // seedWalletsAndWithdrawals(): clients[0]/clients[1] each get one wallet
    // (available_balance=200, pending_balance=50); every provider team gets
    // one (available_balance=5000, pending_balance=1000) - confirmed via a
    // direct GET /admin/wallet check.
    clientAvailableBalance: "200",
    clientPendingBalance: "50",
    providerAvailableBalance: "5,000",
    providerPendingBalance: "1,000",
  },

  discountCodes: {
    active: { code: "E2E10ACTIVE", status: "active" },
    expired: { code: "E2E20EXPIRED", status: "expired" },
    exhausted: { code: "E2E5EXHAUSTED", status: "exhausted" },
    inactive: { code: "E2E15INACTIVE", status: "inactive" },
    scheduled: { code: "E2E25SCHEDULED", status: "scheduled" },
  },

  staticPages: {
    // scope/showIn*/content below are additive facts confirmed against
    // E2EFixtureSeeder.php's seedPages() (+ a direct GET /admin/pages check)
    // - never mutate/delete these 3 rows from a test, they're shared
    // read-only fixtures for list/edit-prefill assertions.
    about: {
      slug: "e2e-about",
      title: "E2E About Page",
      published: true,
      scope: "both",
      scopeLabel: "كلاهما",
      content: 'This is the e2e fixture "about" page content.',
      showInMenu: true,
      showInFooter: true,
      showInRegistration: false,
    },
    terms: {
      slug: "e2e-terms",
      title: "E2E Terms & Conditions",
      published: true,
      scope: "client",
      scopeLabel: "عميل",
      content: "These are the e2e fixture terms & conditions.",
      showInMenu: false,
      showInFooter: true,
      showInRegistration: true,
    },
    draft: {
      slug: "e2e-draft-page",
      title: "E2E Draft Page",
      published: false,
      scope: "provider",
      scopeLabel: "مزود خدمة",
      content: "Unpublished e2e fixture draft page.",
      showInMenu: false,
      showInFooter: false,
      showInRegistration: false,
    },
  },

  questions: {
    // Additive facts confirmed against a direct GET /admin/questions?include_inactive=1
    // (E2EFixtureSeeder.php's seedQuestions()) - `options` lists each
    // question's seeded option_text values in order.
    single: {
      text: "E2E: What type of waqf services do you need?",
      type: "single",
      active: true,
      options: ["Legal", "Accounting", "Property Management"],
    },
    multiple: {
      text: "E2E: Which additional services interest you?",
      type: "multiple",
      active: true,
      options: ["Consulting", "Company Formation"],
    },
    inactive: {
      text: "E2E: Tell us more about your waqf.",
      type: "text",
      active: false,
    },
  },

  reviews: {
    excellent: {
      text: "E2E review: excellent, fast turnaround.",
      rating: 5,
    },
    average: {
      text: "E2E review: average, could improve communication.",
      rating: 3,
    },
    poor: { text: "E2E review: poor, missed the deadline.", rating: 1 },
  },

  roles: {
    readOnly: { name: "E2E Read Only Support" },
  },
};
