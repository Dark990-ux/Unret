import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useT } from '@/lib/i18n';
import { radius, useTheme } from './theme';
import { Button, Row, Text } from './ui';

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Appointment times offered after picking a day (every 30 minutes, 07:00–21:00). */
const TIMES = Array.from({ length: 29 }, (_, i) => [7 + Math.floor(i / 2), (i % 2) * 30] as const);

/**
 * Pop-up month calendar: tap a day (past days are greyed out); in date-and-time mode, then tap a time.
 * Used where the platform has no native picker (the web build of the app).
 */
export function CalendarSheet({ visible, value, mode, onClose, onPick, minDate, values, onPickMany }: {
  visible: boolean; value: Date | null; mode: 'date' | 'datetime' | 'multi'; minDate?: Date;
  onClose: () => void; onPick?: (d: Date) => void;
  /** mode "multi": several days, confirmed with Done */
  values?: Date[]; onPickMany?: (d: Date[]) => void;
}) {
  const th = useTheme();
  const { t, intl } = useT();
  const today = startOfDay(new Date());
  const min = startOfDay(minDate ?? today);
  const [month, setMonth] = useState(() => { const b = value ?? min; return new Date(b.getFullYear(), b.getMonth(), 1); });
  const [day, setDay] = useState<Date | null>(value ? startOfDay(value) : null);
  const [many, setMany] = useState<Date[]>(values ?? []);
  useEffect(() => { if (visible && mode === 'multi') setMany(values ?? []); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(intl, { weekday: 'narrow' })), [intl]); // Monday first
  const cells = useMemo(() => {
    const first = (month.getDay() + 6) % 7; // Monday = 0
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  }, [month]);
  const canPrev = new Date(month.getFullYear(), month.getMonth(), 0) >= min;

  const pickDay = (d: Date) => {
    if (mode === 'multi') { setMany((l) => (l.some((x) => sameDay(x, d)) ? l.filter((x) => !sameDay(x, d)) : [...l, d].sort((a, b) => +a - +b))); return; }
    setDay(d);
    if (mode === 'date') { onPick?.(d); onClose(); }
  };
  const pickTime = (h: number, m: number) => {
    if (!day) return;
    onPick?.(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m));
    onClose();
  };
  const now = new Date();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(12,12,29,0.45)', justifyContent: 'flex-end' }} accessibilityLabel={t('Close')}>
        <Pressable onPress={() => undefined} testID="calendar-sheet"
          style={{ backgroundColor: th.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, gap: 12, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable onPress={() => canPrev && setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Previous month')} disabled={!canPrev}>
              <Text style={{ fontSize: 26, color: canPrev ? th.brand : th.line, paddingHorizontal: 8 }}>‹</Text>
            </Pressable>
            <Text variant="h2" style={{ textTransform: 'capitalize' }}>{month.toLocaleDateString(intl, { month: 'long', year: 'numeric' })}</Text>
            <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Next month')}>
              <Text style={{ fontSize: 26, color: th.brand, paddingHorizontal: 8 }}>›</Text>
            </Pressable>
          </Row>
          <View style={{ flexDirection: 'row' }}>
            {weekdays.map((w, i) => <Text key={i} variant="small" style={{ width: `${100 / 7}%`, textAlign: 'center', fontWeight: '600' }}>{w}</Text>)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((d, i) => {
              if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 44 }} />;
              const past = d < min;
              const selected = mode === 'multi' ? many.some((x) => sameDay(x, d)) : day && sameDay(d, day);
              const isToday = sameDay(d, today);
              return (
                <View key={d.toISOString()} style={{ width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Pressable onPress={() => !past && pickDay(d)} disabled={past} accessibilityRole="button" accessibilityState={{ selected: !!selected, disabled: past }}
                    accessibilityLabel={d.toLocaleDateString(intl, { weekday: 'long', day: 'numeric', month: 'long' })}
                    style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? th.brand : 'transparent', borderWidth: isToday && !selected ? 1.5 : 0, borderColor: th.brand }}>
                    <Text style={{ color: selected ? th.onBrand : past ? th.line : th.text, fontWeight: selected || isToday ? '700' : '400' }}>{d.getDate()}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {mode === 'datetime' && (
            day ? (
              <View style={{ gap: 6 }}>
                <Text variant="label">{t('Time')} · {day.toLocaleDateString(intl, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {TIMES.map(([h, m]) => {
                    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
                    if (at < now) return null;
                    const on = value && +at === +value;
                    const label = at.toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' });
                    return (
                      <Pressable key={label} onPress={() => pickTime(h, m)} accessibilityRole="button" accessibilityLabel={label}
                        style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: on ? th.brand : th.line, backgroundColor: on ? th.brand : th.card }}>
                        <Text color={on ? th.onBrand : th.text}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : <Text variant="small">{t('Choose a day, then a time.')}</Text>
          )}
          {mode === 'multi' ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="small">{many.length ? t('{n} days selected', { n: many.length }) : t('Tap every day that suits you.')}</Text>
              <Row>
                {many.length > 0 && <Button small variant="ghost" title={t('Clear')} onPress={() => setMany([])} />}
                <Button small title={t('Done')} onPress={() => { onPickMany?.(many); onClose(); }} />
              </Row>
            </Row>
          ) : (
            <Row style={{ justifyContent: 'space-between' }}>
              <Button small variant="ghost" title={t('Today')} onPress={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); pickDay(today); }} />
              <Button small variant="outline" title={t('Close')} onPress={onClose} />
            </Row>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
