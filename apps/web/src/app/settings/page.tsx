'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Download, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { CitySelect } from '@/components/domain';
import { Alert, Avatar, Button, Card, Container, Field, FileUpload, Input, PageHeader, PageLoader, Select } from '@/components/ui-exports';
import { RequireAuth } from '@/components/shell';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { LOCALES, useT } from '@/lib/i18n';

export default function Page() {
  return <RequireAuth><Settings /></RequireAuth>;
}

const NOTIF_LABELS: Record<string, string> = {
  NEW_MATCHING_REQUEST: 'New matching request', NEW_OFFER: 'New offer', OFFER_ACCEPTED: 'Offer accepted', OFFER_REJECTED: 'Offer declined',
  OFFER_MODIFICATION_REQUESTED: 'Offer changes requested', OFFER_REVISED: 'Offer revised', NEW_MESSAGE: 'New message',
  APPOINTMENT_APPROACHING: 'Appointment reminder', JOB_STATUS_CHANGED: 'Job updates', JOB_CHANGE_PROPOSED: 'Proposed job changes',
  JOB_CANCELLED: 'Job cancelled', PAYMENT_COMPLETED: 'Payment completed', REVIEW_RECEIVED: 'Review received',
  VERIFICATION_UPDATED: 'Verification result', DISPUTE_UPDATED: 'Dispute updates',
};

function Settings() {
  const { t, setLocale } = useT();
  const { me, reload, logout } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState({ name: me!.name, preferredLanguage: me!.preferredLanguage, city: me!.city ?? '', addressText: me!.addressText ?? '' });
  const [avatar, setAvatar] = useState<{ key: string; url: string } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const prefs = useApi<any[]>('/notifications/preferences');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [mfa, setMfa] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  useEffect(() => { if (location.hash) document.querySelector(location.hash)?.scrollIntoView(); }, [prefs.data]);
  const flash = (tone: 'green' | 'red', text: string) => { setMsg({ tone, text }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const wrap = (fn: () => Promise<void>, ok: string) => fn().then(() => flash('green', ok)).catch((e) => flash('red', e.message));

  const exportData = async () => {
    const data = await api('/users/me/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `unret-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <Container className="max-w-3xl">
      <PageHeader title={t('Settings')} />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="space-y-6">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">{t('Profile')}</h2>
          <div className="flex items-center gap-4">
            <Avatar name={profile.name} url={avatar?.url} size={64} />
            <FileUpload purpose="avatar" accept="image/jpeg,image/png,image/webp" label={t('Change photo')} onUploaded={(f) => setAvatar(f)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Full name')}><Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
            <Field label={t('Language')}>
              <Select value={profile.preferredLanguage} onChange={(e) => setProfile({ ...profile, preferredLanguage: e.target.value })}>{LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</Select>
            </Field>
            <Field label={t('City')}><CitySelect value={profile.city} onChange={(c) => setProfile({ ...profile, city: c })} allowEmpty /></Field>
            <Field label={t('Address')} hint={t('Pre-filled when you post requests. Never shown publicly.')}><Input value={profile.addressText} onChange={(e) => setProfile({ ...profile, addressText: e.target.value })} /></Field>
          </div>
          <Button onClick={() => wrap(async () => {
            await api('/users/me', { method: 'PATCH', body: { ...profile, city: profile.city || undefined, ...(avatar ? { avatarKey: avatar.key } : {}) } });
            setLocale(profile.preferredLanguage as any);
            await reload();
          }, t('Profile saved.'))}>{t('Save profile')}</Button>
        </Card>

        <Card id="notifications" className="p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">{t('Notifications')}</h2>
          <p className="mb-4 text-sm text-ink-muted">{t('Essential notifications (e.g. accepted offers, cancellations, payments) are always sent.')}</p>
          {!prefs.data ? <PageLoader /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead><tr className="text-left text-ink-muted"><th className="pb-2 font-medium">{t('Event')}</th>{['In app', 'Email', 'Push', 'SMS'].map((c) => <th key={c} className="pb-2 text-center font-medium">{t(c)}</th>)}</tr></thead>
                <tbody>
                  {prefs.data.map((p, i) => (
                    <tr key={p.type} className="border-t border-surface-line dark:border-white/10">
                      <td className="py-2">{t(NOTIF_LABELS[p.type] ?? p.type)}{p.essential && <span className="ml-1 text-xs text-ink-muted">({t('essential')})</span>}</td>
                      {(['inApp', 'email', 'push', 'sms'] as const).map((ch) => (
                        <td key={ch} className="py-2 text-center">
                          <input type="checkbox" aria-label={`${p.type} ${ch}`} className="h-4 w-4 accent-brand-700" checked={p[ch]} disabled={p.essential && ch !== 'sms'}
                            onChange={(e) => { const next = [...prefs.data!]; next[i] = { ...p, [ch]: e.target.checked }; prefs.setData(next); }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button className="mt-4" onClick={() => wrap(async () => { prefs.setData(await api('/notifications/preferences', { method: 'PUT', body: { items: prefs.data!.map(({ type, inApp, email, push, sms }) => ({ type, inApp, email, push, sms })) } })); }, t('Preferences saved.'))}>{t('Save preferences')}</Button>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold text-ink dark:text-white"><KeyRound className="h-4 w-4" />{t('Password')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Current password')}><Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label={t('New password')} hint={t('At least 10 characters.')}><Input type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          </div>
          <Button variant="outline" disabled={!pw.currentPassword || pw.newPassword.length < 10} onClick={() => wrap(async () => { await api('/auth/password', { body: pw }); setPw({ currentPassword: '', newPassword: '' }); }, t('Password changed. Other sessions were signed out.'))}>{t('Change password')}</Button>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold text-ink dark:text-white"><ShieldCheck className="h-4 w-4" />{t('Two-factor authentication')}</h2>
          {me!.mfaEnabled ? <Alert tone="green">{t('Two-factor authentication is enabled.')}</Alert> : !mfa ? (
            <>
              <p className="text-sm text-ink-muted">{t('Add an extra layer of security with an authenticator app. Required for administrators.')}</p>
              <Button variant="outline" onClick={async () => setMfa(await api('/auth/mfa/setup', { method: 'POST' }))}>{t('Set up')}</Button>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">{t('Add this key to your authenticator app, then enter the 6-digit code:')}</p>
              <code className="block break-all rounded-lg bg-surface-sunk p-3 text-sm dark:bg-white/5">{mfa.secret}</code>
              <div className="flex gap-2">
                <Input inputMode="numeric" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} className="max-w-[160px]" aria-label={t('Verification code')} />
                <Button onClick={() => wrap(async () => { await api('/auth/mfa/enable', { body: { code: mfaCode } }); await reload(); setMfa(null); }, t('Two-factor authentication enabled.'))}>{t('Enable')}</Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">{t('Your data')}</h2>
          <p className="text-sm text-ink-muted">{t('Download a copy of your personal data, or delete your account. Records needed by the other party or required by law (completed jobs, payments) are kept in anonymised form.')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportData}><Download className="h-4 w-4" />{t('Export my data')}</Button>
            <Button variant="danger" onClick={() => {
              if (!confirm(t('Delete your account permanently? This cannot be undone.'))) return;
              wrap(async () => { await api('/users/me', { method: 'DELETE' }); await logout(); router.push('/'); }, t('Account deleted.'));
            }}><Trash2 className="h-4 w-4" />{t('Delete account')}</Button>
          </div>
        </Card>
      </div>
    </Container>
  );
}
