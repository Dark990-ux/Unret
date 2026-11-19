import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { citiesFor } from '@unret/shared';
import { absUrl, api, Purpose, upload } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Avatar, Badge, Button, Card, Input, Row, Select, Stars, Text } from './ui';
import { radius, useTheme } from './theme';
import { money } from '@/lib/format';

export interface CategoryNode { id: string; slug: string; name: string; icon: string | null; remoteAllowed: boolean; requiredVerifications: string[]; children: CategoryNode[] }
const cache: Record<string, CategoryNode[]> = {};

export function useCategories() {
  const { locale } = useT();
  const [tree, setTree] = useState<CategoryNode[]>(cache[locale] ?? []);
  useEffect(() => {
    if (cache[locale]) return setTree(cache[locale]);
    api<CategoryNode[]>('/categories', { query: { country: 'RO', locale } }).then((r) => { cache[locale] = r; setTree(r); }).catch(() => undefined);
  }, [locale]);
  const flat = useMemo(() => tree.flatMap((p) => p.children), [tree]);
  return { tree, flat };
}

export function CategorySelect({ value, onChange, bySlug, placeholder }: { value: string; onChange: (v: string) => void; bySlug?: boolean; placeholder?: string }) {
  const { tree } = useCategories();
  const { t } = useT();
  const options = tree.flatMap((p) => p.children.map((c) => ({ value: bySlug ? c.slug : c.id, label: `${c.icon ?? ''} ${c.name}`.trim(), group: p.name })));
  return <Select value={value} onChange={onChange} options={options} placeholder={placeholder ?? t('Choose a service')} label={t('Service')} />;
}

export function CitySelect({ value, onChange, allowEmpty }: { value: string; onChange: (city: string, lat?: number, lng?: number) => void; allowEmpty?: boolean }) {
  const { t } = useT();
  const cities = citiesFor('RO');
  const options = [...(allowEmpty ? [{ value: '', label: t('Any city') }] : []), ...cities.map((c) => ({ value: c.name, label: c.name }))];
  return <Select value={value} label={t('City')} placeholder={allowEmpty ? t('Any city') : t('Choose a city')} options={options as any}
    onChange={(v) => { const c = cities.find((x) => x.name === v); onChange(v, c?.lat, c?.lng); }} />;
}

export interface Badges { identity: boolean; business: boolean; qualifications: { categoryId: string | null; name: string }[]; additional: boolean }

export function VerificationBadges({ badges, compact }: { badges: Badges; compact?: boolean }) {
  const { t } = useT();
  const items = [
    badges.identity && <Badge key="i" tone="green">✓ {t('Identity verified')}</Badge>,
    badges.business && <Badge key="b" tone="blue">✓ {t('Business verified')}</Badge>,
    ...badges.qualifications.map((q) => <Badge key={`q${q.categoryId}`} tone="violet">🎓 {compact ? t('Qualified') : t('Qualified: {name}', { name: q.name })}</Badge>),
    badges.additional && <Badge key="a">{t('Additional checks')}</Badge>,
  ].filter(Boolean);
  return items.length ? <Row gap={6}>{items}</Row> : null;
}

export function Rating({ avg, count }: { avg: number; count: number }) {
  const { t } = useT();
  if (!count) return <Text variant="small">{t('No reviews yet')}</Text>;
  return <Row gap={4}><Stars value={avg} /><Text variant="label">{avg.toFixed(1)}</Text><Text variant="small">({count})</Text></Row>;
}

export function PriceHint({ minor, type, currency }: { minor: number | null; type: string | null; currency: string | null }) {
  const { t, intl } = useT();
  if (minor == null) return <Text variant="small">{t('Price on request')}</Text>;
  return <Text variant="label">{type === 'ESTIMATE' ? `${t('from')} ` : ''}{money(minor, currency ?? 'RON', intl)}{type === 'HOURLY' ? t('/hour') : ''}</Text>;
}

export function ProCard({ p, onPress }: { p: any; onPress: () => void }) {
  const { t } = useT();
  return (
    <Card onPress={onPress}>
      <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }} gap={12}>
        <Avatar name={p.displayName} url={absUrl(p.avatarUrl)} size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="h2" numberOfLines={1}>{p.displayName}</Text>
          <Text variant="small" numberOfLines={2}>{p.mainService}{p.headline ? ` · ${p.headline}` : ''}</Text>
          <Rating avg={p.ratingAvg} count={p.ratingCount} />
          <Row gap={10}>
            {p.city ? <Text variant="small">📍 {p.city}{p.distanceKm != null ? ` · ${p.distanceKm} km` : ''}</Text> : null}
            <PriceHint minor={p.indicativePriceMinor} type={p.pricingType} currency={p.currency} />
          </Row>
          {p.availability === 'available' && <Badge tone="green">{t('Available soon')}</Badge>}
          <VerificationBadges badges={p.badges} compact />
        </View>
      </Row>
    </Card>
  );
}

/** Date/time picker: native wheels/dialogs on iOS/Android, text entry on web. */
export function DateTimeField({ value, onChange, mode = 'datetime', placeholder }: { value: Date | null; onChange: (d: Date | null) => void; mode?: 'date' | 'datetime'; placeholder?: string }) {
  const th = useTheme();
  const { t, intl } = useT();
  const [show, setShow] = useState<null | 'date' | 'time'>(null);
  if (Platform.OS === 'web') {
    const fmt = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, '0');
      const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      return mode === 'date' ? day : `${day} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    return <Input defaultValue={value ? fmt(value) : ''} placeholder={mode === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm'}
      onChangeText={(s) => { if (!s) return onChange(null); const d = new Date(s.replace(' ', 'T')); if (!isNaN(+d)) onChange(d); }} />;
  }
  const label = value ? (mode === 'date' ? value.toLocaleDateString(intl) : dateTime(value, intl)) : placeholder ?? t('Choose');
  return (
    <View>
      <Row style={{ flexWrap: 'nowrap' }}>
        <Pressable onPress={() => setShow('date')} accessibilityRole="button" style={{ flex: 1, borderWidth: 1, borderColor: th.line, borderRadius: radius.md, minHeight: 46, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: th.card }}>
          <Text color={value ? th.text : th.muted}>📅 {label}</Text>
        </Pressable>
        {value && <Button small variant="ghost" title="✕" onPress={() => onChange(null)} />}
      </Row>
      {show && (
        <DateTimePicker value={value ?? new Date()} mode={Platform.OS === 'ios' && mode === 'datetime' ? 'datetime' : show} minimumDate={new Date()} minuteInterval={15}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(e, d) => {
            if (e.type === 'dismissed' || !d) return setShow(null);
            onChange(d);
            if (Platform.OS === 'android' && mode === 'datetime' && show === 'date') setShow('time'); else setShow(Platform.OS === 'ios' ? show : null);
          }} />
      )}
      {show && Platform.OS === 'ios' && <Button small variant="soft" title={t('Close')} onPress={() => setShow(null)} />}
    </View>
  );
}

/** Pick an image (or PDF when allowed) and upload it; returns the storage key. */
export function useUploader(purpose: Purpose) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled) return null;
    const a = r.assets[0];
    return run({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, mimeType: a.mimeType ?? 'image/jpeg', file: (a as any).file });
  };
  const pickDocument = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
    if (r.canceled) return null;
    const a = r.assets[0];
    return run({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf', file: (a as any).file });
  };
  const run = async (f: Parameters<typeof upload>[0]) => {
    setBusy(true); setError(null);
    try { return await upload(f, purpose); } catch (e) { setError((e as Error).message); return null; } finally { setBusy(false); }
  };
  return { pickImage, pickDocument, busy, error };
}
