'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Bell, Briefcase, Calendar, ChevronDown, ClipboardList, Globe, Inbox, LayoutDashboard, LogOut, Menu, MessageSquare,
  Search, Settings, Shield, ShieldCheck, Star, User, Users, Wallet, X, Heart, BarChart3, FolderTree, Flag, Scale, CreditCard, ScrollText, Landmark, Layers, AlertTriangle, Building2, Plus, LifeBuoy, UserCog,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useT, LOCALES } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { Avatar, Button, PageLoader, cx } from './ui';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cx('inline-flex items-center gap-2 font-semibold tracking-tight text-ink dark:text-white', className)} aria-label="UNRET">
      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
        U
        <svg aria-hidden viewBox="0 0 12 12" className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5"><path d="M6 0c.4 3 1.6 4.4 6 6-4.4 1.6-5.6 3-6 6-.4-3-1.6-4.4-6-6 4.4-1.6 5.6-3 6-6z" fill="#ffc83d" /></svg>
      </span>
      <span className="text-lg">UNRET</span>
    </Link>
  );
}

function useUnread() {
  const { me } = useAuth();
  const [n, setN] = useState(0);
  const [m, setM] = useState(0);
  const load = () => {
    if (!me) return;
    api('/notifications', { query: { pageSize: 1 } }).then((r) => setN(r.unread)).catch(() => undefined);
    api<any[]>('/conversations').then((r) => setM(r.reduce((s, c) => s + c.unread, 0))).catch(() => undefined);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [me?.id]);
  useRealtime('notification', () => setN((x) => x + 1), !!me);
  useRealtime<{ mine: boolean }>('message', (p) => !p.mine && setM((x) => x + 1), !!me);
  return { notifications: n, messages: m, reload: load };
}

export function SiteHeader() {
  const { me, logout, mode, setMode } = useAuth();
  const { t, locale, setLocale } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const unread = useUnread();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); setMenu(false); unread.reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pathname]);
  useEffect(() => {
    const f = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);

  const isPro = !!me?.professional;
  const proMode = isPro && mode === 'professional';
  const links = !me
    ? [{ href: '/search', label: t('Find professionals') }, { href: '/become-a-pro', label: t('Become a professional') }]
    : proMode
      ? [{ href: '/pro', label: t('Dashboard') }, { href: '/pro/requests', label: t('Requests') }, { href: '/jobs?as=professional', label: t('Jobs') }, { href: '/pro/availability', label: t('Calendar') }]
      : [{ href: '/dashboard', label: t('Dashboard') }, { href: '/search', label: t('Find professionals') }, { href: '/jobs', label: t('Jobs') }];

  const switchMode = () => {
    const next = proMode ? 'customer' : 'professional';
    if (next === 'professional' && !isPro) return router.push('/pro/onboard');
    setMode(next);
    router.push(next === 'professional' ? '/pro' : '/dashboard');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-surface-line bg-white/90 backdrop-blur dark:border-white/10 dark:bg-[#0c0c1d]/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={cx('rounded-lg px-3 py-2 text-sm font-medium', pathname === l.href.split('?')[0] ? 'text-brand-700 dark:text-brand-300' : 'text-ink-soft hover:text-ink dark:text-white/70 dark:hover:text-white')}>{l.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {isPro && (
            <div role="radiogroup" aria-label={t('Mode')} className="mr-1 hidden items-center rounded-full border border-surface-line bg-surface-sunk p-0.5 text-xs font-semibold sm:flex dark:border-white/10 dark:bg-white/5">
              {(['customer', 'professional'] as const).map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} onClick={() => { if (mode !== m) { setMode(m); router.push(m === 'professional' ? '/pro' : '/dashboard'); } }}
                  className={cx('rounded-full px-3 py-1.5', mode === m ? 'bg-accent-500 text-accent-ink' : 'text-ink-soft hover:text-ink dark:text-white/70')}>
                  {m === 'customer' ? t('Customer') : t('Professional')}
                </button>
              ))}
            </div>
          )}
          {me && !proMode && <Button size="sm" href="/requests/new" className="hidden sm:inline-flex"><Plus className="h-4 w-4" />{t('Post a request')}</Button>}
          {me ? (
            <>
              <IconLink href="/messages" label={t('Messages')} count={unread.messages}><MessageSquare className="h-5 w-5" /></IconLink>
              <IconLink href="/notifications" label={t('Notifications')} count={unread.notifications}><Bell className="h-5 w-5" /></IconLink>
              <div className="relative" ref={menuRef}>
                <button onClick={() => setMenu((x) => !x)} className="ml-1 flex items-center gap-1.5 rounded-full p-0.5 pr-2 hover:bg-surface-sunk dark:hover:bg-white/5" aria-haspopup="menu" aria-expanded={menu}>
                  <Avatar name={me.name} size={32} />
                  <ChevronDown className="hidden h-4 w-4 text-ink-muted sm:block" />
                </button>
                {menu && (
                  <div role="menu" className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-surface-line bg-white py-1.5 shadow-lg dark:border-white/10 dark:bg-[#14152b]">
                    <div className="border-b border-surface-line px-4 py-2.5 dark:border-white/10">
                      <div className="truncate text-sm font-medium text-ink dark:text-white">{me.name}</div>
                      <div className="truncate text-xs text-ink-muted">{me.email ?? me.phone}</div>
                    </div>
                    <MenuItem onClick={switchMode} icon={<Briefcase className="h-4 w-4" />}>
                      {proMode ? t('Switch to customer mode') : isPro ? t('Switch to professional mode') : t('Offer your services')}
                    </MenuItem>
                    <MenuItem href="/saved" icon={<Heart className="h-4 w-4" />}>{t('Saved professionals')}</MenuItem>
                    <MenuItem href="/payments" icon={<Wallet className="h-4 w-4" />}>{t('Payments')}</MenuItem>
                    <MenuItem href="/settings" icon={<Settings className="h-4 w-4" />}>{t('Settings')}</MenuItem>
                    <MenuItem href="/help" icon={<LifeBuoy className="h-4 w-4" />}>{t('Help & support')}</MenuItem>
                    {me.role === 'ADMIN' && <MenuItem href="/admin" icon={<Shield className="h-4 w-4" />}>{t('Administration')}</MenuItem>}
                    <div className="my-1 border-t border-surface-line dark:border-white/10" />
                    <div className="flex items-center gap-2 px-4 py-2 text-sm text-ink-soft dark:text-white/70">
                      <Globe className="h-4 w-4" />
                      {LOCALES.map((l) => (
                        <button key={l.code} onClick={() => setLocale(l.code)} className={cx('rounded px-1.5 py-0.5', locale === l.code ? 'bg-brand-50 font-medium text-brand-800 dark:bg-brand-900/50 dark:text-brand-100' : 'hover:text-ink')}>{l.code.toUpperCase()}</button>
                      ))}
                    </div>
                    <MenuItem onClick={async () => { await logout(); router.push('/'); }} icon={<LogOut className="h-4 w-4" />}>{t('Sign out')}</MenuItem>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button onClick={() => setLocale(locale === 'ro' ? 'en' : 'ro')} className="hidden items-center gap-1 rounded-lg px-2 py-2 text-sm text-ink-soft hover:text-ink sm:inline-flex dark:text-white/70" aria-label={t('Language')}>
                <Globe className="h-4 w-4" />{locale.toUpperCase()}
              </button>
              <Button variant="ghost" size="sm" href="/login">{t('Sign in')}</Button>
              <Button size="sm" href="/register" className="hidden sm:inline-flex">{t('Create account')}</Button>
            </>
          )}
          <button className="ml-1 rounded-lg p-2 text-ink-soft md:hidden dark:text-white/70" onClick={() => setOpen((x) => !x)} aria-label="Menu" aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-surface-line px-4 py-3 md:hidden dark:border-white/10">
          {links.map((l) => <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink dark:text-white">{l.label}</Link>)}
          {me && !proMode && <Link href="/requests/new" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-brand-700">{t('Post a request')}</Link>}
          {!me && <Link href="/register" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-brand-700">{t('Create account')}</Link>}
        </nav>
      )}
    </header>
  );
}

function IconLink({ href, label, count, children }: { href: string; label: string; count: number; children: React.ReactNode }) {
  return (
    <Link href={href} className="relative rounded-lg p-2 text-ink-soft hover:bg-surface-sunk hover:text-ink dark:text-white/70 dark:hover:bg-white/5" aria-label={`${label}${count ? ` (${count})` : ''}`}>
      {children}
      {count > 0 && <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">{count > 99 ? '99+' : count}</span>}
    </Link>
  );
}

function MenuItem({ href, onClick, icon, children }: { href?: string; onClick?: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = 'flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-ink hover:bg-surface-sunk dark:text-white/90 dark:hover:bg-white/5';
  return href ? <Link role="menuitem" href={href} className={cls}>{icon}{children}</Link> : <button role="menuitem" onClick={onClick} className={cls}>{icon}{children}</button>;
}

export function Footer() {
  const { t } = useT();
  return (
    <footer className="mt-20 border-t border-surface-line bg-surface-sunk/60 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-5 sm:px-6">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-ink-muted dark:text-white/50">{t('Finding and providing professional services, made simple and transparent.')}</p>
        </div>
        <FooterCol title={t('Customers')} links={[['/search', t('Find professionals')], ['/requests/new', t('Post a request')], ['/how-it-works', t('How it works')]]} />
        <FooterCol title={t('Professionals')} links={[['/become-a-pro', t('Become a professional')], ['/pro', t('Professional dashboard')], ['/trust', t('Verification & trust')]]} />
        <FooterCol title={t('Help')} links={[['/help', t('Help & support')], ['/help/new?kind=contact', t('Contact us')], ['/help/new?kind=problem', t('Report a problem')]]} />
        <FooterCol title="UNRET" links={[['/terms', t('Terms of service')], ['/privacy', t('Privacy policy')], ['/trust', t('Trust & safety')]]} />
      </div>
      <div className="border-t border-surface-line py-4 text-center text-xs text-ink-muted dark:border-white/10">© {new Date().getFullYear()} UNRET · România</div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-ink dark:text-white">{title}</h3>
      <ul className="space-y-2">{links.map(([h, l]) => <li key={h + l}><Link href={h} className="text-sm text-ink-muted hover:text-brand-700 dark:text-white/50">{l}</Link></li>)}</ul>
    </div>
  );
}

/** Client-side guard. Server still enforces every rule. */
export function RequireAuth({ children, pro, admin }: { children: React.ReactNode; pro?: boolean; admin?: boolean }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (loading) return;
    if (!me) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (pro && !me.professional) router.replace('/pro/onboard');
    else if (admin && me.role !== 'ADMIN') router.replace('/dashboard');
  }, [me, loading, pro, admin, router, pathname]);
  if (loading || !me || (pro && !me.professional) || (admin && me.role !== 'ADMIN')) return <PageLoader />;
  return <>{children}</>;
}

type NavItem = { href: string; label: string; icon: React.ReactNode };

function SideNav({ items, title }: { items: NavItem[]; title: string }) {
  const pathname = usePathname();
  return (
    <aside className="mb-6 lg:mb-0 lg:w-56 lg:shrink-0">
      <div className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wider text-ink-muted lg:block">{title}</div>
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
        {items.map((i) => {
          const active = pathname === i.href || (i.href !== '/admin' && i.href !== '/pro' && pathname.startsWith(i.href));
          return (
            <Link key={i.href} href={i.href} className={cx('flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium', active ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100' : 'text-ink-soft hover:bg-surface-sunk hover:text-ink dark:text-white/70 dark:hover:bg-white/5')}>
              {i.icon}{i.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function ProShell({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const { me, mode, setMode } = useAuth();
  useEffect(() => { if (me?.professional && mode !== 'professional') setMode('professional'); }, [me, mode, setMode]);
  const items: NavItem[] = [
    { href: '/pro', label: t('Overview'), icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: '/pro/requests', label: t('Requests'), icon: <Inbox className="h-4 w-4" /> },
    { href: '/pro/offers', label: t('My offers'), icon: <ClipboardList className="h-4 w-4" /> },
    { href: '/jobs?as=professional', label: t('Jobs'), icon: <Briefcase className="h-4 w-4" /> },
    { href: '/pro/availability', label: t('Calendar'), icon: <Calendar className="h-4 w-4" /> },
    { href: '/pro/profile', label: t('Profile'), icon: <User className="h-4 w-4" /> },
    { href: '/pro/verification', label: t('Verification'), icon: <ShieldCheck className="h-4 w-4" /> },
    { href: '/pro/reviews', label: t('Reviews'), icon: <Star className="h-4 w-4" /> },
    { href: '/pro/earnings', label: t('Earnings'), icon: <Wallet className="h-4 w-4" /> },
    ...(me?.professional?.companyId ? [{ href: '/pro/company', label: t('Company'), icon: <Building2 className="h-4 w-4" /> }] : []),
    { href: '/pro/plans', label: t('Plans'), icon: <Layers className="h-4 w-4" /> },
  ];
  return (
    <RequireAuth pro>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:flex lg:gap-8">
        <SideNav items={items} title={t('Professional')} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </RequireAuth>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const { me } = useAuth();
  const perms: string[] = (me as any)?.adminPermissions ?? [];
  // Each administrator sees only what their role allows (the server enforces the same rules).
  const all: (NavItem & { perm: string })[] = [
    { href: '/admin', label: t('Overview'), icon: <LayoutDashboard className="h-4 w-4" />, perm: 'dashboard.view' },
    { href: '/admin/support', label: t('Support'), icon: <LifeBuoy className="h-4 w-4" />, perm: 'tickets.manage' },
    { href: '/admin/users', label: t('Users'), icon: <Users className="h-4 w-4" />, perm: 'users.view' },
    { href: '/admin/jobs', label: t('Jobs'), icon: <Briefcase className="h-4 w-4" />, perm: 'jobs.manage' },
    { href: '/admin/disputes', label: t('Disputes'), icon: <Scale className="h-4 w-4" />, perm: 'disputes.manage' },
    { href: '/admin/reports', label: t('Reports'), icon: <Flag className="h-4 w-4" />, perm: 'content.moderate' },
    { href: '/admin/reviews', label: t('Reviews'), icon: <Star className="h-4 w-4" />, perm: 'content.moderate' },
    { href: '/admin/verifications', label: t('Verifications'), icon: <ShieldCheck className="h-4 w-4" />, perm: 'verifications.manage' },
    { href: '/admin/payments', label: t('Payments'), icon: <CreditCard className="h-4 w-4" />, perm: 'payments.view' },
    { href: '/admin/plans', label: t('Subscriptions'), icon: <Layers className="h-4 w-4" />, perm: 'plans.manage' },
    { href: '/admin/analytics', label: t('Analytics'), icon: <BarChart3 className="h-4 w-4" />, perm: 'analytics.view' },
    { href: '/admin/fraud', label: t('Risk indicators'), icon: <AlertTriangle className="h-4 w-4" />, perm: 'fraud.view' },
    { href: '/admin/categories', label: t('Categories'), icon: <FolderTree className="h-4 w-4" />, perm: 'catalog.manage' },
    { href: '/admin/countries', label: t('Countries'), icon: <Landmark className="h-4 w-4" />, perm: 'catalog.manage' },
    { href: '/admin/team', label: t('Admin team'), icon: <UserCog className="h-4 w-4" />, perm: 'dashboard.view' },
    { href: '/admin/audit', label: t('Audit log'), icon: <ScrollText className="h-4 w-4" />, perm: 'audit.view' },
  ];
  const items: NavItem[] = all.filter((i) => perms.includes(i.perm));
  return (
    <RequireAuth admin>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:flex lg:gap-8">
        <SideNav items={items} title={t('Administration')} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </RequireAuth>
  );
}

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('mx-auto max-w-7xl px-4 py-8 sm:px-6', className)}>{children}</div>;
}


