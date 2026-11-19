import { router } from 'expo-router';
import { useState } from 'react';
import { CitySelect, useCategories } from '@/components/domain';
import { Alert, Button, Card, Chip, Field, Input, Row, Screen, Segmented, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function Onboard() {
  const { t } = useT();
  const { reload, setMode } = useAuth();
  const { tree } = useCategories();
  const [f, setF] = useState({ accountType: 'INDIVIDUAL', businessName: '', registrationNumber: '', city: '', lat: 0, lng: 0, serviceRadiusKm: '25' });
  const [cats, setCats] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api('/professionals/onboard', { body: { accountType: f.accountType, businessName: f.businessName || undefined, registrationNumber: f.registrationNumber || undefined, city: f.city, lat: f.lat, lng: f.lng, serviceRadiusKm: Number(f.serviceRadiusKm) || 25, categoryIds: cats } });
      await reload(); setMode('professional'); router.replace('/(tabs)');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Text variant="small">{t('Start with the essentials — you can complete your profile later. You keep using the same account as a customer.')}</Text>
      <Card>
        <Text variant="h2">1. {t('Account type')}</Text>
        <Segmented value={f.accountType} onChange={(accountType) => setF({ ...f, accountType })} items={[{ value: 'INDIVIDUAL', label: t('Individual professional') }, { value: 'COMPANY', label: t('Company / team') }]} />
        <Field label={f.accountType === 'COMPANY' ? t('Company name') : t('Business name (optional)')} required={f.accountType === 'COMPANY'}><Input value={f.businessName} onChangeText={(businessName) => setF({ ...f, businessName })} /></Field>
        {f.accountType === 'COMPANY' && <Field label={t('Registration number (CUI)')} required><Input value={f.registrationNumber} onChangeText={(registrationNumber) => setF({ ...f, registrationNumber })} /></Field>}
      </Card>
      <Card>
        <Text variant="h2">2. {t('Which services do you offer?')}</Text>
        {tree.map((p) => (
          <Row key={p.id} gap={6} style={{ marginBottom: 6 }}>
            <Text variant="small" style={{ width: '100%' }}>{p.icon} {p.name}</Text>
            {p.children.map((c) => <Chip key={c.id} label={`${c.name}${c.requiredVerifications.includes('QUALIFICATION') ? ' 🎓' : ''}`} selected={cats.includes(c.id)} onPress={() => setCats((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))} />)}
          </Row>
        ))}
        <Text variant="small">🎓 {t('Regulated service: you receive requests after your qualification is verified.')}</Text>
      </Card>
      <Card>
        <Text variant="h2">3. {t('Where do you work?')}</Text>
        <Field label={t('Base city')} required><CitySelect value={f.city} onChange={(city, lat, lng) => setF({ ...f, city, lat: lat ?? 0, lng: lng ?? 0 })} /></Field>
        <Field label={t('Travel radius: {n} km', { n: f.serviceRadiusKm })}><Input value={f.serviceRadiusKm} onChangeText={(serviceRadiusKm) => setF({ ...f, serviceRadiusKm })} keyboardType="number-pad" /></Field>
      </Card>
      {err && <Alert>{err}</Alert>}
      <Button title={t('Create professional profile')} onPress={submit} loading={busy} disabled={!cats.length || !f.lat} />
    </Screen>
  );
}
