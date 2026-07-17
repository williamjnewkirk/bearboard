import { BRAND_COLORS } from '@bearboard/shared';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Membership } from '../lib/team-types';
import { GRAY, type IconName } from '../lib/ui';
import { TodayScreen } from './TodayScreen';
import { ThisWeekScreen } from './ThisWeekScreen';
import { CoachPlanScreen } from './CoachPlanScreen';
import { FeedScreen } from './FeedScreen';
import { ChatScreen } from './ChatScreen';
import { MoreScreen, type MoreSub } from './MoreScreen';

export type Tab = 'today' | 'week' | 'feed' | 'chat' | 'more';

const TABS: Array<{ key: Tab; label: string; icon: IconName; iconActive: IconName }> = [
  { key: 'today', label: 'Today', icon: 'today-outline', iconActive: 'today' },
  { key: 'week', label: 'Week', icon: 'calendar-outline', iconActive: 'calendar' },
  { key: 'feed', label: 'Feed', icon: 'pulse-outline', iconActive: 'pulse' },
  { key: 'chat', label: 'Chat', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { key: 'more', label: 'More', icon: 'ellipsis-horizontal', iconActive: 'ellipsis-horizontal' },
];
const ORDER: Tab[] = TABS.map((t) => t.key);

/** Bottom-tab shell for the signed-in, in-a-team experience. */
export function MemberTabs({
  membership,
  onChanged,
}: {
  membership: Membership;
  onChanged: () => void;
}) {
  const isCoach = membership.role === 'coach';
  const [tab, setTab] = useState<Tab>('today');
  const [moreInitial, setMoreInitial] = useState<MoreSub | null>(null);
  const tabRef = useRef<Tab>('today');
  tabRef.current = tab;

  // Navigate to a tab, optionally deep-linking into a More sub-screen.
  function go(next: Tab, moreSub?: MoreSub) {
    setMoreInitial(moreSub ?? null);
    setTab(next);
  }

  // Horizontal swipe between tabs. Only captures clearly-horizontal drags so
  // vertical scrolling and inner horizontal scrollers keep working.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 28 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) < 55) return;
          const idx = ORDER.indexOf(tabRef.current);
          const nextIdx = g.dx < 0 ? idx + 1 : idx - 1;
          if (nextIdx >= 0 && nextIdx < ORDER.length) go(ORDER[nextIdx]!);
        },
      }),
    [],
  );

  return (
    <View style={styles.root}>
      <View style={styles.body} {...pan.panHandlers}>
        {tab === 'today' ? <TodayScreen membership={membership} onNavigate={go} /> : null}
        {tab === 'week' ? (
          isCoach ? (
            <CoachPlanScreen membership={membership} />
          ) : (
            <ThisWeekScreen membership={membership} />
          )
        ) : null}
        {tab === 'feed' ? <FeedScreen membership={membership} /> : null}
        {tab === 'chat' ? <ChatScreen membership={membership} /> : null}
        {tab === 'more' ? (
          <MoreScreen membership={membership} onChanged={onChanged} initialOpen={moreInitial} />
        ) : null}
      </View>
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => go(t.key)}>
              <Ionicons
                name={active ? t.iconActive : t.icon}
                size={22}
                color={active ? BRAND_COLORS.maroon : GRAY[400]}
              />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: GRAY[50] },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GRAY[300],
    paddingBottom: 24,
    paddingTop: 6,
    backgroundColor: BRAND_COLORS.white,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 1 },
  tabText: { fontSize: 10, color: GRAY[400], fontWeight: '700' },
  tabTextActive: { color: BRAND_COLORS.maroon },
});
