'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { Rating } from '@/components/domain';
import { Avatar, Button, Card, Container, Empty, PageHeader, PageLoader } from '@/components/ui-exports';
import { RequireAuth } from '@/components/shell';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  const { t } = useT();
  const { data, loading } = useApi<any[]>('/users/me/saved');
  return (
    <RequireAuth>
      <Container className="max-w-4xl">
        <PageHeader title={t('Saved professionals')} />
        {loading ? <PageLoader /> : !data?.length ? <Empty icon={<Heart className="h-8 w-8" />} title={t('No saved professionals')} text={t('Tap “Save” on a profile to keep it here.')} action={<Button href="/search">{t('Find professionals')}</Button>} /> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.map((p) => (
              <Link key={p.professionalId} href={`/pros/${p.professionalId}`}>
                <Card className="flex items-center gap-3 p-4 hover:shadow-md">
                  <Avatar name={p.name} url={p.avatarUrl} size={48} />
                  <div className="min-w-0"><div className="truncate font-medium text-ink dark:text-white">{p.name}</div><div className="truncate text-sm text-ink-muted">{p.headline ?? p.city}</div><Rating avg={p.ratingAvg} count={p.ratingCount} /></div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </RequireAuth>
  );
}
