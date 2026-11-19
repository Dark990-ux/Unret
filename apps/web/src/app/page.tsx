'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, BadgeCheck, ClipboardList, MessagesSquare, Scale, Search, ShieldCheck, Star } from 'lucide-react';
import { CategorySelect, CitySelect, useCategories } from '@/components/domain';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function Home() {
  const { t } = useT();
  const { me } = useAuth();
  const router = useRouter();
  const { tree } = useCategories();
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const q = new URLSearchParams();
    if (category) q.set('category', category);
    if (city) q.set('city', city);
    router.push(`/search?${q}`);
  };

  return (
    <>
      <section className="relative overflow-hidden border-b border-surface-line bg-gradient-to-b from-brand-50 to-white dark:border-white/10 dark:from-brand-950/40 dark:to-transparent">
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-medium text-brand-800 shadow-sm ring-1 ring-brand-100 dark:bg-white/5 dark:text-brand-200 dark:ring-white/10">
              <ShieldCheck className="h-4 w-4" /> {t('Verified professionals, honest reviews')}
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-ink dark:text-white sm:text-5xl">{t('The right professional for every job.')}</h1>
            <p className="mt-4 max-w-2xl text-lg text-ink-soft dark:text-white/70">{t('Describe what you need, receive offers from verified professionals near you, compare them and hire with confidence.')}</p>
          </div>
          <form onSubmit={search} className="mt-8 grid max-w-3xl gap-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-surface-line sm:grid-cols-[1.4fr_1fr_auto] dark:bg-white/5 dark:ring-white/10">
            <label className="sr-only" htmlFor="home-cat">{t('Service')}</label>
            <CategorySelect id="home-cat" value={category} onChange={setCategory} includeParents placeholder={t('What service do you need?')} />
            <label className="sr-only" htmlFor="home-city">{t('City')}</label>
            <CitySelect id="home-city" value={city} onChange={(c) => setCity(c)} allowEmpty />
            <Button type="submit" size="lg" className="h-[42px]"><Search className="h-4 w-4" />{t('Search')}</Button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-soft dark:text-white/60">
            <span>{t('Or let professionals come to you:')}</span>
            <Link href={me ? '/requests/new' : '/register?next=/requests/new'} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline dark:text-brand-300">
              {t('Post a free request')} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-ink dark:text-white">{t('Browse services')}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tree.map((c) => (
            <Card key={c.id} className="p-5">
              <Link href={`/search?category=${c.slug}`} className="flex items-center gap-3 font-semibold text-ink hover:text-brand-700 dark:text-white">
                <span className="text-2xl" aria-hidden>{c.icon}</span>{c.name}
              </Link>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {c.children.map((s) => (
                  <li key={s.id}><Link href={`/search?category=${s.slug}`} className="inline-block rounded-full bg-surface-sunk px-2.5 py-1 text-xs text-ink-soft hover:bg-brand-50 hover:text-brand-800 dark:bg-white/5 dark:text-white/70">{s.name}</Link></li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-surface-line bg-white dark:border-white/10 dark:bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-ink dark:text-white">{t('How UNRET works')}</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-4">
            {[
              [ClipboardList, t('Describe the job'), t('Tell us what you need, where and when. Add photos if helpful. It is free.')],
              [MessagesSquare, t('Receive offers'), t('Matching professionals nearby send you quotes. Ask questions in the chat.')],
              [Scale, t('Compare and choose'), t('Compare price, what is included, reviews, verification and availability.')],
              [Star, t('Get it done, review'), t('Track the job, confirm completion and leave a verified review.')],
            ].map(([Icon, title, text], i) => {
              const I = Icon as typeof Star;
              return (
                <div key={i}>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"><I className="h-5 w-5" /></div>
                  <h3 className="mt-4 font-semibold text-ink dark:text-white">{i + 1}. {title as string}</h3>
                  <p className="mt-1 text-sm text-ink-muted dark:text-white/60">{text as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid items-center gap-8 rounded-3xl bg-brand-800 p-8 text-white sm:p-12 md:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('Are you a professional?')}</h2>
            <p className="mt-3 max-w-xl text-brand-100">{t('Receive requests from customers in your area, send offers, manage your calendar and build your reputation — all in one place.')}</p>
            <ul className="mt-5 space-y-2 text-sm text-brand-50">
              {[t('Requests matched to your services and area'), t('Fair ranking — based on relevance and reliability, not on who pays most'), t('Verification badges that show real evidence')].map((x) => (
                <li key={x} className="flex items-start gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />{x}</li>
              ))}
            </ul>
          </div>
          <div className="flex md:justify-end">
            <Button size="lg" variant="secondary" href={me ? '/pro/onboard' : '/register?next=/pro/onboard'} className="!bg-white !text-brand-800 hover:!bg-brand-50">{t('Start offering services')} <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </section>
    </>
  );
}
