'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { Badge, Button, Card, Empty, PageHeader, PageLoader, Stars, StatusBadge, Textarea } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <ProShell><Reviews /></ProShell>;
}

function Reviews() {
  const { t, intl } = useT();
  const { data, loading, reload } = useApi<any[]>('/reviews/mine');
  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState('');
  return (
    <>
      <PageHeader title={t('Reviews')} subtitle={t('You can respond publicly once to each review.')} />
      {loading ? <PageLoader /> : !data?.length ? <Empty icon={<Star className="h-8 w-8" />} title={t('No reviews yet')} text={t('After a completed job, customers can leave a verified review.')} /> : (
        <div className="space-y-3">
          {data.map((r) => (
            <Card key={r.id} className="space-y-2 p-5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Stars value={r.overall} /><span className="font-medium">{r.customer.name}</span><span className="text-ink-muted">· {r.job.request.title} · {date(r.createdAt, intl)}</span>
                {r.isVerifiedJob && <Badge tone="green">{t('Verified job')}</Badge>}
                {r.status !== 'PUBLISHED' && <StatusBadge status={r.status} />}
              </div>
              <div className="text-xs text-ink-muted">{t('Communication')} {r.communication} · {t('Quality')} {r.quality} · {t('Punctuality')} {r.punctuality}</div>
              {r.text && <p className="text-sm text-ink-soft dark:text-white/75">{r.text}</p>}
              {r.professionalResponse ? (
                <div className="border-l-2 border-brand-200 pl-3 text-sm text-ink-soft dark:border-brand-800"><b>{t('Your response')}:</b> {r.professionalResponse}</div>
              ) : replying === r.id ? (
                <div className="space-y-2">
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[80px]" />
                  <div className="flex gap-2"><Button size="sm" disabled={text.length < 2} onClick={async () => { await api(`/reviews/${r.id}/respond`, { body: { response: text } }); setReplying(null); setText(''); reload(); }}>{t('Publish response')}</Button><Button size="sm" variant="ghost" onClick={() => setReplying(null)}>{t('Cancel')}</Button></div>
                </div>
              ) : <Button size="sm" variant="outline" onClick={() => setReplying(r.id)}>{t('Respond')}</Button>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
