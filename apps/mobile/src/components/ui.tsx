import { ReactNode, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text as RNText, TextInput, TextInputProps, TextProps, View, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '@/lib/i18n';
import { radius, useTheme } from './theme';

export function Text({ style, variant = 'body', color, ...p }: TextProps & { variant?: 'title' | 'h2' | 'body' | 'small' | 'label' | 'big'; color?: string }) {
  const t = useTheme();
  const v = {
    big: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
    title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
    h2: { fontSize: 17, fontWeight: '600' as const },
    body: { fontSize: 15 },
    small: { fontSize: 13, color: t.muted },
    label: { fontSize: 14, fontWeight: '500' as const },
  }[variant];
  return <RNText style={[{ color: t.text }, v, color ? { color } : null, style]} {...p} />;
}

/** Scrollable screen with pull-to-refresh and safe-area handling. */
export function Screen({ children, onRefresh, refreshing, scroll = true, padded = true, edges }: {
  children: ReactNode; onRefresh?: () => void; refreshing?: boolean; scroll?: boolean; padded?: boolean; edges?: ('top' | 'bottom')[];
}) {
  const t = useTheme();
  const inner = padded ? { padding: 16, gap: 14 } : {};
  return (
    <SafeAreaView edges={edges ?? []} style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        {scroll ? (
          <ScrollView contentContainerStyle={[inner, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.brand} /> : undefined}>
            {children}
          </ScrollView>
        ) : <View style={[{ flex: 1 }, inner]}>{children}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const t = useTheme();
  const s = [{ backgroundColor: t.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, padding: 14, gap: 8 }, style];
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.75 }]} accessibilityRole="button">{children}</Pressable> : <View style={s}>{children}</View>;
}

export function Row({ children, style, gap = 8 }: { children: ReactNode; style?: ViewStyle; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, small, icon, style }: {
  title: string; onPress?: () => void; variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'soft' | 'sun' | 'glass'; loading?: boolean; disabled?: boolean; small?: boolean; icon?: string; style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = { primary: t.brand, outline: 'transparent', ghost: 'transparent', danger: t.danger, soft: t.brandSoft, sun: t.sun, glass: 'rgba(255,255,255,0.14)' }[variant];
  const fg = { primary: t.onBrand, outline: t.text, ghost: t.soft, danger: '#fff', soft: t.brandDark, sun: t.onSun, glass: '#ffffff' }[variant];
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [{
        backgroundColor: bg, borderRadius: radius.md, paddingVertical: small ? 8 : 13, paddingHorizontal: small ? 12 : 16, minHeight: small ? 36 : 46,
        alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
        borderWidth: variant === 'outline' || variant === 'glass' ? 1 : 0, borderColor: variant === 'glass' ? 'rgba(255,255,255,0.35)' : t.line, opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 14 : 15 }}>{icon ? `${icon}  ` : ''}{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}{required ? <Text color={t.danger}> *</Text> : null}</Text>
      {children}
      {hint ? <Text variant="small">{hint}</Text> : null}
    </View>
  );
}

export function Input(p: TextInputProps & { multiline?: boolean }) {
  const t = useTheme();
  return (
    <TextInput placeholderTextColor={t.muted} {...p}
      style={[{ borderWidth: 1, borderColor: t.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: t.text, backgroundColor: t.card, minHeight: p.multiline ? 110 : 46, textAlignVertical: p.multiline ? 'top' : 'center' }, p.style]} />
  );
}

/** Option picker shown as a bottom sheet — works the same on iOS, Android and web. */
export function Select<T extends string>({ value, onChange, options, placeholder, label }: { value: T | ''; onChange: (v: T) => void; options: { value: T; label: string; group?: string }[]; placeholder: string; label?: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  let lastGroup: string | undefined;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label ?? placeholder}
        style={{ borderWidth: 1, borderColor: t.line, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 46, justifyContent: 'center', backgroundColor: t.card }}>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <Text color={current ? t.text : t.muted} numberOfLines={1} style={{ flex: 1 }}>{current?.label ?? placeholder}</Text>
          <Text color={t.muted}>▾</Text>
        </Row>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label ?? placeholder}>
        {options.map((o) => {
          const header = o.group && o.group !== lastGroup ? o.group : null;
          lastGroup = o.group;
          return (
            <View key={o.value}>
              {header ? <Text variant="small" style={{ marginTop: 12, marginBottom: 4, fontWeight: '600' }}>{header}</Text> : null}
              <Pressable onPress={() => { onChange(o.value); setOpen(false); }} style={{ paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.line }} accessibilityRole="button">
                <Text style={o.value === value ? { color: t.brand, fontWeight: '600' } : undefined}>{o.label}</Text>
              </Pressable>
            </View>
          );
        })}
      </Sheet>
    </>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const t = useTheme();
  const { t: tr } = useT();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} accessibilityLabel={tr('Close')} />
      <View style={{ maxHeight: '85%', backgroundColor: t.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.line, marginBottom: 8 }} />
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text variant="h2" style={{ flex: 1 }}>{title}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={tr('Close')} hitSlop={12}><Text variant="h2" color={t.muted}>✕</Text></Pressable>
        </Row>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36, gap: 12 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const TONES = {
  gray: ['#eeeef8', '#44466a'], green: ['#dcfce7', '#166534'], blue: ['#eeefff', '#2326ab'], sun: ['#fff4d1', '#7a5200'],
  amber: ['#fef3c7', '#92400e'], red: ['#fee2e2', '#991b1b'], violet: ['#ede9fe', '#5b21b6'],
} as const;
export type Tone = keyof typeof TONES;
export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: Tone }) {
  const [bg, fg] = TONES[tone];
  return <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}><RNText style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{children}</RNText></View>;
}

const STATUS: Record<string, [string, Tone]> = {
  DRAFT: ['Draft', 'gray'], PUBLISHED: ['Waiting for offers', 'blue'], OFFERS_RECEIVED: ['Offers received', 'violet'], OFFER_ACCEPTED: ['Offer accepted', 'green'],
  CANCELLED: ['Cancelled', 'gray'], EXPIRED: ['Expired', 'gray'], PENDING: ['Pending', 'amber'], MODIFICATION_REQUESTED: ['Changes requested', 'amber'],
  ACCEPTED: ['Accepted', 'green'], REJECTED: ['Rejected', 'red'], WITHDRAWN: ['Withdrawn', 'gray'], SCHEDULED: ['Scheduled', 'blue'],
  IN_PROGRESS: ['In progress', 'violet'], COMPLETED: ['Completed', 'green'], DISPUTED: ['Disputed', 'red'], HIDDEN: ['Hidden', 'gray'],
  LIMITED: ['Limited', 'amber'], PUBLIC: ['Public', 'green'], APPROVED: ['Approved', 'green'], RECORDED: ['Recorded', 'gray'], SUCCEEDED: ['Paid', 'green'], PROPOSED: ['Awaiting approval', 'amber'],
};
export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const [l, tone] = STATUS[status] ?? [status, 'gray' as Tone];
  return <Badge tone={tone}>{t(l)}</Badge>;
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const t = useTheme();
  return <RNText accessibilityLabel={`${value.toFixed(1)} / 5`} style={{ fontSize: size, color: t.star, letterSpacing: 1 }}>{'★'.repeat(Math.round(value))}<RNText style={{ color: t.line }}>{'★'.repeat(5 - Math.round(value))}</RNText></RNText>;
}

export function StarInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const t = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
      <Text>{label}</Text>
      <Row gap={2} style={{ flexWrap: 'nowrap' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Pressable key={i} onPress={() => onChange(i)} hitSlop={6} accessibilityRole="radio" accessibilityState={{ selected: value === i }} accessibilityLabel={`${label} ${i}`}>
            <RNText style={{ fontSize: 28, color: i <= value ? t.star : t.line }}>★</RNText>
          </Pressable>
        ))}
      </Row>
    </Row>
  );
}

export function Avatar({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) {
  const t = useTheme();
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.sunk }} accessibilityIgnoresInvertColors />;
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><RNText style={{ color: t.brandDark, fontWeight: '700', fontSize: size * 0.38 }}>{initials}</RNText></View>;
}

export function Loader() {
  const t = useTheme();
  return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={t.brand} size="large" /></View>;
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 28, gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line, borderRadius: radius.lg }}>
      <Text variant="h2" style={{ textAlign: 'center' }}>{title}</Text>
      {text ? <Text variant="small" style={{ textAlign: 'center' }}>{text}</Text> : null}
      {action}
    </View>
  );
}

export function Alert({ children, tone = 'red' }: { children: ReactNode; tone?: 'red' | 'green' | 'blue' | 'amber' }) {
  const c = { red: ['#fee2e2', '#991b1b'], green: ['#dcfce7', '#166534'], blue: ['#eeefff', '#2326ab'], amber: ['#fef3c7', '#92400e'] }[tone];
  return <View style={{ backgroundColor: c[0], borderRadius: radius.md, padding: 12 }} accessibilityRole={tone === 'red' ? 'alert' : undefined}><RNText style={{ color: c[1], fontSize: 14 }}>{children}</RNText></View>;
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: selected ? t.brand : t.line, backgroundColor: selected ? t.brand : t.card }}>
      <Text style={{ fontSize: 14, color: selected ? t.onBrand : t.soft }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {items.map((i) => <Chip key={i.value} label={i.label} selected={i.value === value} onPress={() => onChange(i.value)} />)}
    </ScrollView>
  );
}

export function KV({ label, value }: { label: string; value: ReactNode }) {
  return <View style={{ gap: 2 }}><Text variant="small">{label}</Text>{typeof value === 'string' || typeof value === 'number' ? <Text variant="label">{value}</Text> : value}</View>;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginVertical: 4 }} />;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <View style={{ gap: 10 }}><Row style={{ justifyContent: 'space-between' }}><Text variant="h2">{title}</Text>{action}</Row>{children}</View>;
}
