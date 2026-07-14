import { BRAND_COLORS } from '@bearboard/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Membership } from '../lib/team-types';
import { ThisWeekScreen } from './ThisWeekScreen';
import { TeamScreen } from './TeamScreen';
import { ProfileScreen } from './ProfileScreen';

type Tab = 'week' | 'team' | 'profile';

/** Simple bottom-tab shell for the signed-in, in-a-team experience. */
export function MemberTabs({
  membership,
  onChanged,
}: {
  membership: Membership;
  onChanged: () => void;
}) {
  const isCoach = membership.role === 'coach';
  const [tab, setTab] = useState<Tab>(isCoach ? 'team' : 'week');

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        {tab === 'week' ? <ThisWeekScreen membership={membership} /> : null}
        {tab === 'team' ? <TeamScreen membership={membership} onChanged={onChanged} /> : null}
        {tab === 'profile' ? <ProfileScreen /> : null}
      </View>
      <View style={styles.tabBar}>
        <TabButton label="This Week" active={tab === 'week'} onPress={() => setTab('week')} />
        <TabButton label="Team" active={tab === 'team'} onPress={() => setTab('team')} />
        <TabButton label="Profile" active={tab === 'profile'} onPress={() => setTab('profile')} />
      </View>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tab} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND_COLORS.white },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    paddingBottom: 24,
    paddingTop: 8,
    backgroundColor: BRAND_COLORS.white,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  tabText: { fontSize: 13, color: '#888', fontWeight: '600' },
  tabTextActive: { color: BRAND_COLORS.maroon },
});
