/**
 * More — hub for everything that isn't a main tab: meets, shoes, injury,
 * announcements, schedule, team (roster/squads/codes), settings.
 */
import { BRAND_COLORS } from '@bearboard/shared';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal as RNModal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Membership } from '../lib/team-types';
import { GRAY, Screen, type IconName } from '../lib/ui';
import { MeetsScreen } from './MeetsScreen';
import { ShoesScreen } from './ShoesScreen';
import { InjuryScreen } from './InjuryScreen';
import { AnnouncementsScreen } from './AnnouncementsScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { TeamScreen } from './TeamScreen';
import { SettingsScreen } from './SettingsScreen';

export type MoreSub =
  'meets' | 'shoes' | 'injury' | 'announcements' | 'schedule' | 'team' | 'settings';
type Sub = MoreSub;

export function MoreScreen({
  membership,
  onChanged,
  initialOpen = null,
}: {
  membership: Membership;
  onChanged: () => void;
  initialOpen?: MoreSub | null;
}) {
  const isCoach = membership.role === 'coach';
  const [open, setOpen] = useState<Sub | null>(initialOpen);

  const items: Array<{ key: Sub; icon: IconName; label: string; hint: string }> = [
    {
      key: 'announcements',
      icon: 'megaphone-outline',
      label: 'Announcements',
      hint: isCoach ? 'Post to the team or a squad' : 'From your coaches',
    },
    {
      key: 'schedule',
      icon: 'time-outline',
      label: 'Schedule',
      hint: 'Practices, lifts, meetings, travel',
    },
    {
      key: 'meets',
      icon: 'flag-outline',
      label: 'Meets & racing',
      hint: isCoach ? 'Entries, results, debrief status' : 'Entries, results, your debriefs',
    },
    ...(!isCoach
      ? ([
          {
            key: 'shoes',
            icon: 'footsteps-outline',
            label: 'Shoes',
            hint: 'Mileage tracks itself',
          },
          {
            key: 'injury',
            icon: 'medkit-outline',
            label: 'Injury & fatigue',
            hint: 'Only you + coaches see this',
          },
        ] as const)
      : ([
          {
            key: 'injury',
            icon: 'medkit-outline',
            label: 'Injury board',
            hint: 'Everyone not Healthy, grouped',
          },
        ] as const)),
    {
      key: 'team',
      icon: 'people-outline',
      label: 'Team',
      hint: isCoach ? 'Roster, squads, join codes' : 'Roster',
    },
    {
      key: 'settings',
      icon: 'settings-outline',
      label: 'Settings',
      hint: 'Profile, sync, notifications, account',
    },
  ];

  return (
    <Screen title="More" subtitle={membership.team.name} scroll>
      {items.map((item) => (
        <Pressable key={item.key} onPress={() => setOpen(item.key)}>
          <View style={st.row}>
            <View style={st.iconBubble}>
              <Ionicons name={item.icon} size={20} color={BRAND_COLORS.maroon} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.label}>{item.label}</Text>
              <Text style={st.hint}>{item.hint}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={GRAY[300]} />
          </View>
        </Pressable>
      ))}
      <Text style={st.footer}>BearBoard · Newkirk Technologies</Text>

      <RNModal visible={open !== null} animationType="slide" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: GRAY[50] }}>
          <Pressable onPress={() => setOpen(null)} style={st.back} hitSlop={10}>
            <Ionicons name="chevron-back" size={18} color={BRAND_COLORS.maroon} />
            <Text style={st.backText}>More</Text>
          </Pressable>
          {open === 'meets' ? <MeetsScreen membership={membership} /> : null}
          {open === 'shoes' ? <ShoesScreen membership={membership} /> : null}
          {open === 'injury' ? <InjuryScreen membership={membership} /> : null}
          {open === 'announcements' ? <AnnouncementsScreen membership={membership} /> : null}
          {open === 'schedule' ? <ScheduleScreen membership={membership} /> : null}
          {open === 'team' ? <TeamScreen membership={membership} onChanged={onChanged} /> : null}
          {open === 'settings' ? (
            <SettingsScreen membership={membership} onChanged={onChanged} />
          ) : null}
        </View>
      </RNModal>
    </Screen>
  );
}

const st = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: BRAND_COLORS.white,
    borderWidth: 1,
    borderColor: GRAY[200],
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: `${BRAND_COLORS.maroon}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 15, fontWeight: '700', color: GRAY[900] },
  hint: { fontSize: 12, color: GRAY[400], marginTop: 1 },
  footer: { textAlign: 'center', color: GRAY[300], fontSize: 12, marginTop: 16 },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingTop: 54,
    paddingHorizontal: 12,
    paddingBottom: 2,
    backgroundColor: GRAY[50],
  },
  backText: { color: BRAND_COLORS.maroon, fontWeight: '700', fontSize: 15 },
});
