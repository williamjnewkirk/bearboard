import { BRAND_COLORS } from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { RosterRow } from '../lib/team-types';

interface Squad {
  id: string;
  name: string;
  memberIds: string[];
}

const PLACEHOLDER = '#8A8A8A';

/** Coach-only squad management: create/delete squads, assign athletes. */
export function SquadManager({ teamId, roster }: { teamId: string; roster: RosterRow[] }) {
  const getSupabase = useSupabase();
  const [squads, setSquads] = useState<Squad[]>([]);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Squad | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('squads')
      .select('id, name, squad_members(team_member_id)')
      .eq('team_id', teamId)
      .order('name');
    if (error) {
      setError(error.message);
      return;
    }
    setSquads(
      (
        (data ?? []) as unknown as Array<{
          id: string;
          name: string;
          squad_members: Array<{ team_member_id: string }>;
        }>
      ).map((s) => ({
        id: s.id,
        name: s.name,
        memberIds: s.squad_members.map((m) => m.team_member_id),
      })),
    );
  }, [getSupabase, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSquad() {
    const name = newName.trim();
    if (!name) return;
    const sb = await getSupabase();
    const { error } = await sb.from('squads').insert({ team_id: teamId, name });
    if (error) setError(error.message);
    setNewName('');
    await load();
  }

  function confirmDelete(squad: Squad) {
    Alert.alert('Delete squad', `Delete "${squad.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const sb = await getSupabase();
            const { error } = await sb.from('squads').delete().eq('id', squad.id);
            if (error) setError(error.message);
            await load();
          })();
        },
      },
    ]);
  }

  async function toggleMember(squad: Squad, memberId: string, on: boolean) {
    const sb = await getSupabase();
    const { error } = on
      ? await sb.from('squad_members').insert({ squad_id: squad.id, team_member_id: memberId })
      : await sb
          .from('squad_members')
          .delete()
          .eq('squad_id', squad.id)
          .eq('team_member_id', memberId);
    if (error) setError(error.message);
    await load();
    setEditing((prev) =>
      prev && prev.id === squad.id
        ? {
            ...prev,
            memberIds: on
              ? [...prev.memberIds, memberId]
              : prev.memberIds.filter((id) => id !== memberId),
          }
        : prev,
    );
  }

  const athletes = roster.filter((r) => r.role === 'athlete');

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Squads</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.chips}>
        {squads.map((s) => (
          <Pressable
            key={s.id}
            style={styles.chip}
            onPress={() => setEditing(s)}
            onLongPress={() => confirmDelete(s)}
          >
            <Text style={styles.chipText}>
              {s.name} · {s.memberIds.length}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="New squad"
          placeholderTextColor={PLACEHOLDER}
          value={newName}
          onChangeText={setNewName}
        />
        <Pressable style={styles.addBtn} onPress={() => void addSquad()}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Tap a squad to assign athletes · long-press to delete</Text>

      <Modal
        visible={!!editing}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(null)}
      >
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing?.name}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {athletes.map((a) => {
                const on = editing?.memberIds.includes(a.id) ?? false;
                return (
                  <Pressable
                    key={a.id}
                    style={styles.memberRow}
                    onPress={() => editing && void toggleMember(editing, a.id, !on)}
                  >
                    <Text style={styles.checkbox}>{on ? '☑' : '☐'}</Text>
                    <Text style={styles.memberName}>{a.user.name}</Text>
                  </Pressable>
                );
              })}
              {athletes.length === 0 ? <Text style={styles.hint}>No athletes yet.</Text> : null}
            </ScrollView>
            <Pressable style={styles.doneBtn} onPress={() => setEditing(null)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  error: { color: BRAND_COLORS.crimson, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: BRAND_COLORS.forest,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: BRAND_COLORS.white, fontSize: 13, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: BRAND_COLORS.white,
    color: '#111111',
  },
  addBtn: {
    backgroundColor: BRAND_COLORS.green,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addBtnText: { color: BRAND_COLORS.white, fontWeight: '600' },
  hint: { fontSize: 12, color: '#999', marginTop: 6 },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: {
    backgroundColor: BRAND_COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: BRAND_COLORS.forest, marginBottom: 12 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  checkbox: { fontSize: 20, color: BRAND_COLORS.maroon },
  memberName: { fontSize: 15 },
  doneBtn: {
    marginTop: 12,
    backgroundColor: BRAND_COLORS.maroon,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneBtnText: { color: BRAND_COLORS.white, fontWeight: '600' },
});
