import { useAuth } from '@clerk/clerk-expo';
import { BRAND_COLORS } from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { JoinCodeRow, Membership, RosterRow } from '../lib/team-types';

/** Team home: roster, coach join codes, sign out / leave team. */
export function TeamScreen({
  membership,
  onChanged,
}: {
  membership: Membership;
  onChanged: () => void;
}) {
  const { signOut } = useAuth();
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [codes, setCodes] = useState<JoinCodeRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();

    const { data, error: rosterErr } = await sb
      .from('team_members')
      .select('id, role, user:users(id, name, class_year)')
      .eq('team_id', teamId)
      .eq('status', 'active');
    if (rosterErr) {
      setError(`Roster: ${rosterErr.message}`);
      return;
    }
    const rows = (data ?? []) as unknown as RosterRow[];
    rows.sort((a, b) =>
      a.role === b.role ? a.user.name.localeCompare(b.user.name) : a.role === 'coach' ? -1 : 1,
    );
    setRoster(rows);

    if (isCoach) {
      const { data: codeData, error: codeErr } = await sb
        .from('join_codes')
        .select('role, code')
        .eq('team_id', teamId)
        .eq('active', true);
      if (codeErr) {
        setError(`Join codes: ${codeErr.message}`);
        return;
      }
      setCodes((codeData ?? []) as JoinCodeRow[]);
    }
  }, [getSupabase, teamId, isCoach]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function confirmLeave() {
    Alert.alert('Leave team', `Leave ${membership.team.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const sb = await getSupabase();
            const { error } = await sb.rpc('leave_team', { p_team_id: teamId });
            if (error) {
              setError(`Leave: ${error.message}`);
              return;
            }
            onChanged();
          })();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{membership.team.name}</Text>
        <Text style={styles.subtitle}>
          {membership.team.school ? `${membership.team.school} · ` : ''}You are a {membership.role}.
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isCoach && codes.length > 0 ? (
        <View style={styles.codes}>
          <Text style={styles.sectionTitle}>Join codes</Text>
          {codes.map((c) => (
            <View key={c.role} style={styles.codeRow}>
              <Text style={styles.codeRole}>{c.role}</Text>
              <Text style={styles.codeValue}>{c.code}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Roster ({roster.length})</Text>
      <FlatList
        data={roster}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        renderItem={({ item }) => (
          <View style={styles.rosterRow}>
            <Text style={styles.rosterName}>{item.user.name}</Text>
            <Text style={styles.rosterMeta}>
              {item.role === 'coach' ? 'Coach' : (item.user.class_year ?? 'Athlete')}
            </Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        {!isCoach ? (
          <Pressable onPress={confirmLeave}>
            <Text style={styles.leave}>Leave team</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable onPress={() => void signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 64,
    paddingHorizontal: 20,
    backgroundColor: BRAND_COLORS.white,
  },
  header: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '700', color: BRAND_COLORS.maroon },
  subtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  codes: {
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  codeRole: { width: 64, color: '#666', textTransform: 'capitalize' },
  codeValue: { fontSize: 18, fontWeight: '700', letterSpacing: 3, color: BRAND_COLORS.forest },
  rosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  rosterName: { fontSize: 15, fontWeight: '500' },
  rosterMeta: { fontSize: 13, color: '#888' },
  error: { color: BRAND_COLORS.crimson, marginBottom: 8 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  leave: { color: BRAND_COLORS.crimson, textDecorationLine: 'underline' },
  signOut: { color: '#888', textDecorationLine: 'underline' },
});
