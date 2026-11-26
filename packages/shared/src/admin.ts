/** Administrator roles: a small team, each person sees and does only what their job needs. */
export const AdminRole = { OWNER: 'OWNER', SUPPORT: 'SUPPORT', MODERATOR: 'MODERATOR', FINANCE: 'FINANCE' } as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

export const ADMIN_PERMISSIONS = {
  'dashboard.view': 'See the admin dashboard',
  'tickets.manage': 'Answer support tickets',
  'users.view': 'See users and their activity',
  'users.manage': 'Help users: verify email, reset two-factor login, send password reset, message them',
  'users.suspend': 'Suspend and reactivate accounts',
  'conversations.read': 'Read conversations that are part of a case',
  'jobs.manage': 'Cancel, complete or fix jobs and requests',
  'disputes.manage': 'Resolve disputes',
  'content.moderate': 'Handle reports and reviews',
  'verifications.manage': 'Approve or reject verifications',
  'payments.view': 'See payments and payouts',
  'payments.manage': 'Refund payments, retry payouts, change plans',
  'plans.manage': 'Edit subscription plans',
  'catalog.manage': 'Edit categories and countries',
  'analytics.view': 'See platform analytics',
  'fraud.view': 'See fraud signals',
  'audit.view': 'See the audit log',
  'team.manage': 'Add and remove administrators',
} as const;
export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;

const ALL = Object.keys(ADMIN_PERMISSIONS) as AdminPermission[];
export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  OWNER: ALL,
  SUPPORT: ['dashboard.view', 'tickets.manage', 'users.view', 'users.manage', 'conversations.read', 'jobs.manage', 'disputes.manage', 'payments.view'],
  MODERATOR: ['dashboard.view', 'tickets.manage', 'users.view', 'users.manage', 'users.suspend', 'conversations.read', 'jobs.manage', 'content.moderate', 'verifications.manage', 'fraud.view'],
  FINANCE: ['dashboard.view', 'tickets.manage', 'users.view', 'disputes.manage', 'payments.view', 'payments.manage', 'plans.manage', 'analytics.view'],
};

export const ADMIN_ROLE_LABELS: Record<AdminRole, { name: string; description: string }> = {
  OWNER: { name: 'Owner', description: 'Full access, including the admin team.' },
  SUPPORT: { name: 'Support', description: 'Tickets, helping users, jobs and disputes.' },
  MODERATOR: { name: 'Moderator', description: 'Reports, reviews, verifications and account safety.' },
  FINANCE: { name: 'Finance', description: 'Payments, refunds, payouts, plans and analytics.' },
};

export function hasAdminPermission(role: string | null | undefined, permission: AdminPermission): boolean {
  return !!role && (ADMIN_ROLE_PERMISSIONS[role as AdminRole] ?? []).includes(permission);
}
