/**
 * Mobile UI kit — brand-consistent primitives shared by every screen.
 * Neutrals stay gray; brand colors carry primary actions and headers only.
 */
import { BRAND_COLORS } from '@bearboard/shared';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal as RNModal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type DimensionValue,
  type RefreshControlProps,
  type TextInputProps,
} from 'react-native';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Vector icon wrapper (Ionicons) — use instead of emoji for UI chrome. */
export function Icon({
  name,
  size = 20,
  color = GRAY[500],
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

export const GRAY = {
  50: '#F9FAFB',
  100: '#F3F4F6',
  200: '#E5E7EB',
  300: '#D1D5DB',
  400: '#9CA3AF',
  500: '#6B7280',
  600: '#4B5563',
  700: '#374151',
  900: '#111827',
} as const;

const logo = require('../../assets/logo.png');

/** Screen scaffold: brand header row + scrollable body. */
export function Screen({
  title,
  subtitle,
  right,
  children,
  scroll = true,
  refreshControl,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const header = (
    <View style={s.screenHeader}>
      <Image source={logo} style={s.headerLogo} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.screenTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.screenSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  if (!scroll) {
    return (
      <View style={s.screen}>
        {header}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    );
  }
  return (
    <View style={s.screen}>
      {header}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function Card({
  children,
  style,
  accent,
}: {
  children: ReactNode;
  style?: object;
  accent?: string;
}) {
  return (
    <View style={[s.card, accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  small,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
}) {
  const bg =
    variant === 'primary'
      ? BRAND_COLORS.maroon
      : variant === 'secondary'
        ? BRAND_COLORS.green
        : 'transparent';
  const border =
    variant === 'outline' ? GRAY[300] : variant === 'danger' ? `${BRAND_COLORS.crimson}66` : bg;
  const color =
    variant === 'primary' || variant === 'secondary'
      ? BRAND_COLORS.white
      : variant === 'danger'
        ? BRAND_COLORS.crimson
        : variant === 'ghost'
          ? GRAY[500]
          : GRAY[700];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        s.button,
        small && s.buttonSmall,
        { backgroundColor: bg, borderColor: border },
        variant === 'ghost' && { borderColor: 'transparent' },
        (disabled || busy) && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <Text style={[s.buttonText, small && { fontSize: 13 }, { color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  color = GRAY[500],
  onPress,
  active,
}: {
  label: string;
  color?: string;
  onPress?: () => void;
  active?: boolean;
}) {
  const body = (
    <View
      style={[
        s.chip,
        { backgroundColor: `${color}1A` },
        active !== undefined && !active && { backgroundColor: GRAY[100] },
      ]}
    >
      <Text style={[s.chipText, { color: active === false ? GRAY[500] : color }]}>{label}</Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export function Input({
  label,
  ...props
}: TextInputProps & {
  label?: string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={s.inputLabel}>{label}</Text> : null}
      <TextInput placeholderTextColor={GRAY[400]} {...props} style={[s.input, props.style]} />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={s.error}>{children}</Text>;
}

export function EmptyState({
  icon = 'paw-outline',
  title,
  hint,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={26} color={BRAND_COLORS.maroon} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {hint ? <Text style={s.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

/** Pulsing placeholder block. */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: GRAY[200], opacity }, style]}
    />
  );
}

/**
 * A configurable card-shaped skeleton. `avatar` adds a leading circle, `accent`
 * adds the left accent bar (day cards), `stats` adds a row of short blocks
 * (feed), and `lines` are the widths of the text rows.
 */
export function SkeletonCard({
  avatar,
  accent,
  stats,
  lines = ['40%', '70%'],
}: {
  avatar?: boolean;
  accent?: boolean;
  stats?: boolean;
  lines?: DimensionValue[];
}) {
  return (
    <View style={[s.card, accent ? { borderLeftWidth: 3, borderLeftColor: GRAY[200] } : null]}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {avatar ? <Skeleton width={38} height={38} radius={19} /> : null}
        <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
          {lines.map((w, i) => (
            <Skeleton key={i} width={w} height={i === 0 ? 13 : 11} />
          ))}
          {stats ? (
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 2 }}>
              <Skeleton width={44} height={16} />
              <Skeleton width={44} height={16} />
              <Skeleton width={44} height={16} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Repeat a skeleton card N times. */
export function ListSkeleton({
  count = 5,
  avatar,
  accent,
  stats,
  lines,
}: {
  count?: number;
  avatar?: boolean;
  accent?: boolean;
  stats?: boolean;
  lines?: DimensionValue[];
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} avatar={avatar} accent={accent} stats={stats} lines={lines} />
      ))}
    </>
  );
}

export type SkeletonVariant =
  | 'feed'
  | 'chat'
  | 'days'
  | 'today'
  | 'cards'
  | 'shoes'
  | 'status'
  | 'announcements'
  | 'settings';

function VariantBody({ variant }: { variant: SkeletonVariant }) {
  switch (variant) {
    case 'feed':
      return <ListSkeleton avatar stats count={5} />;
    case 'chat':
      return <ListSkeleton avatar lines={['55%', '80%']} count={6} />;
    case 'days':
      return <ListSkeleton accent lines={['35%', '58%']} count={7} />;
    case 'shoes':
      return <ListSkeleton lines={['50%', '100%', '30%']} count={3} />;
    case 'announcements':
      return <ListSkeleton avatar lines={['40%', '85%', '90%']} count={4} />;
    case 'settings':
      return <ListSkeleton lines={['30%', '90%']} count={4} />;
    case 'today':
    case 'status':
      return (
        <>
          <SkeletonCard accent lines={['30%', '80%', '55%']} />
          <ListSkeleton lines={['45%', '68%']} count={3} />
        </>
      );
    case 'cards':
    default:
      return <ListSkeleton lines={['60%', '40%']} count={4} />;
  }
}

/**
 * A loading placeholder that keeps the screen's brand header (so it doesn't
 * butt against the top) and shows content-shaped skeletons matched to the
 * screen via `variant`.
 */
export function LoadingScreen({
  title,
  subtitle,
  variant = 'cards',
  children,
}: {
  title: string;
  subtitle?: string;
  variant?: SkeletonVariant;
  children?: ReactNode;
}) {
  return (
    <Screen title={title} subtitle={subtitle} scroll={false}>
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        {children ?? <VariantBody variant={variant} />}
      </View>
    </Screen>
  );
}

/** Bare spinner-free loader (kept for sub-screens where a header isn't shown). */
export function Loading() {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
      <ListSkeleton />
    </View>
  );
}

/** Full-screen sub-screen (forms, threads). Slide-up, brand header, close X. */
export function SubScreen({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <RNModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.subScreen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.subHeader}>
          <Text style={s.subTitle} numberOfLines={1}>
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn}>
            <Text style={{ fontSize: 16, color: GRAY[500] }}>✕</Text>
          </Pressable>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer ? <View style={s.subFooter}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </RNModal>
  );
}

export function Row({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: object;
}) {
  const body = <View style={[s.row, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** Initials avatar. */
export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${BRAND_COLORS.forest}14`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: BRAND_COLORS.forest, fontWeight: '700', fontSize: size * 0.38 }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GRAY[50], paddingTop: 56 },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerLogo: { width: 34, height: 34, borderRadius: 8 },
  screenTitle: { fontSize: 22, fontWeight: '800', color: BRAND_COLORS.forest },
  screenSubtitle: { fontSize: 12, color: GRAY[500], marginTop: 1 },
  card: {
    backgroundColor: BRAND_COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GRAY[200],
    padding: 14,
    marginBottom: 10,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: BRAND_COLORS.forest },
  button: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: { paddingVertical: 7, paddingHorizontal: 12 },
  buttonText: { fontWeight: '700', fontSize: 15 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: 11, fontWeight: '700' },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: GRAY[500],
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: GRAY[300],
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    backgroundColor: BRAND_COLORS.white,
    color: GRAY[900],
  },
  error: { color: BRAND_COLORS.crimson, marginVertical: 6, fontSize: 13 },
  empty: {
    alignItems: 'center',
    gap: 8,
    padding: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: GRAY[300],
    marginVertical: 8,
    backgroundColor: BRAND_COLORS.white,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: `${BRAND_COLORS.maroon}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontWeight: '700', color: GRAY[700], fontSize: 15, textAlign: 'center' },
  emptyHint: { color: GRAY[500], fontSize: 13, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  subScreen: { flex: 1, backgroundColor: GRAY[50] },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: BRAND_COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: GRAY[200],
  },
  subTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: BRAND_COLORS.forest },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: GRAY[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  subFooter: {
    padding: 16,
    paddingBottom: 28,
    backgroundColor: BRAND_COLORS.white,
    borderTopWidth: 1,
    borderTopColor: GRAY[200],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRAY[300],
  },
});
