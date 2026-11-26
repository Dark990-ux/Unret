'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, PageLoader, Select, StatusBadge } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { ADMIN_PERMISSIONS, ADMIN_ROLE_LABELS, ADMIN_ROLE_PERMISSIONS, AdminRole } from '@unret/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Team /></AdminShell>;
}

const ROLES = Object.keys(ADMIN_ROLE_LABELS) as AdminRole[];

function Team() {
  const { t, intl } = useT();
  const { me } = useAuth();
  const canManage = ((me as any)?.adminPermissions ?? []).includes('team.manage');
  const q = useApi<any[]>('/admin/team');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('SUPPORT');
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const run = async (fn: () => Promise<any>, ok: string) => { setMsg(null); try { q.setData(await fn()); setMsg({ tone: 'green', text: ok }); } catch (x) { setMsg({ tone: 'red', text: (x as Error).message }); } };
  if (q.loading || !q.data) return <PageLoader />;
  return (
    <>
      <PageHeader title={t('Admin team')} subtitle={t('The people who run UNRET and what each of them can do.')} />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {canManage && (
        <Card className="mb-6 p-5">
          <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('Add an administrator')}</h2>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); run(() => api('/admin/team', { body: { email, role } }), t('{email} is now an administrator.', { email })).then(() => setEmail('')); }}>
            <div className="min-w-[240px] flex-1"><Field label={t('Email of their UNRET account')}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field></div>
            <div className="w-48"><Field label={t('Role')}><Select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>{ROLES.map((r) => <option key={r} value={r}>{t(ADMIN_ROLE_LABELS[r].name)}</option>)}</Select></Field></div>
            <Button type="submit">{t('Add')}</Button>
          </form>
          <p className="mt-2 text-xs text-ink-muted">{t('The person must already have an UNRET account. They get a notification and see the admin area from their account menu.')}</p>
        </Card>
      )}
      <Card className="mb-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm" data-testid="team-table">
          <thead><tr className="border-b border-surface-line text-left text-ink-muted dark:border-white/10">{['Name', 'Role', 'Two-factor login', 'Last login', ''].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{t(h)}</th>)}</tr></thead>
          <tbody>
            {q.data.map((m) => (
              <tr key={m.id} className="border-b border-surface-line last:border-0 dark:border-white/10">
                <td className="px-4 py-2.5"><div className="font-medium">{m.name}{m.id === me?.id && <span className="ml-1 text-xs text-ink-muted">({t('you')})</span>}</div><div className="text-xs text-ink-muted">{m.email}</div></td>
                <td className="px-4 py-2.5">{canManage ? <Select value={m.adminRole ?? 'OWNER'} onChange={(e) => run(() => api(`/admin/team/${m.id}`, { method: 'PATCH', body: { role: e.target.value } }), t('Role changed.'))} aria-label={t('Role')} className="max-w-[160px]">{ROLES.map((r) => <option key={r} value={r}>{t(ADMIN_ROLE_LABELS[r].name)}</option>)}</Select> : <Badge tone="blue">{t(ADMIN_ROLE_LABELS[(m.adminRole ?? 'OWNER') as AdminRole].name)}</Badge>}</td>
                <td className="px-4 py-2.5">{m.mfaEnabled ? <Badge tone="green">{t('On')}</Badge> : <Badge tone="amber">{t('Off')}</Badge>}</td>
                <td className="px-4 py-2.5 text-ink-muted">{m.lastLoginAt ? dateTime(m.lastLoginAt, intl) : '—'} {m.status !== 'ACTIVE' && <StatusBadge status={m.status} />}</td>
                <td className="px-4 py-2.5 text-right">{canManage && m.id !== me?.id && <Button size="sm" variant="ghost" onClick={() => { if (confirm(t('Remove {name} from the admin team?', { name: m.name }))) run(() => api(`/admin/team/${m.id}`, { method: 'DELETE' }), t('Removed from the admin team.')); }}>{t('Remove')}</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('What each role can do')}</h2>
      <div className="grid gap-3 md:grid-cols-2" data-testid="role-matrix">
        {ROLES.map((r) => (
          <Card key={r} className="p-4">
            <div className="font-semibold text-ink dark:text-white">{t(ADMIN_ROLE_LABELS[r].name)}</div>
            <p className="mb-2 text-xs text-ink-muted">{t(ADMIN_ROLE_LABELS[r].description)}</p>
            <ul className="space-y-0.5 text-sm text-ink-soft dark:text-white/70">{ADMIN_ROLE_PERMISSIONS[r].map((p) => <li key={p}>✓ {t(ADMIN_PERMISSIONS[p])}</li>)}</ul>
          </Card>
        ))}
      </div>
    </>
  );
}
