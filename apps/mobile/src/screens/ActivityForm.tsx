/**
 * Manual activity entry + edit (PRD §5.3): type, date/time, distance (miles),
 * duration, optional HR/elevation, description (team-visible), private note
 * to coach (always coach-only), shoe assignment, delete-own.
 */
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_LABELS,
  BRAND_COLORS,
  milesToMeters,
  metersToMiles,
  parseTimeToSeconds,
  formatDuration,
  type ActivityType,
} from '@bearboard/shared';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership } from '../lib/team-types';
import { Button, ErrorText, GRAY, Input, SubScreen } from '../lib/ui';

export interface ActivityRow {
  id: string;
  team_member_id: string;
  type: ActivityType;
  title: string | null;
  started_at: string;
  distance_m: number | null;
  duration_s: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_m: number | null;
  description: string | null;
  private_note?: string | null;
  shoe_id: string | null;
  source: string;
  status: string;
}

interface ShoeOption {
  id: string;
  label: string;
  is_default: boolean;
}

export function ActivityForm({
  visible,
  membership,
  activity,
  onClose,
  onSaved,
}: {
  visible: boolean;
  membership: Membership;
  activity: ActivityRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [type, setType] = useState<ActivityType>(activity?.type ?? 'run');
  const [title, setTitle] = useState(activity?.title ?? '');
  const [date, setDate] = useState(() =>
    (activity?.started_at ?? new Date().toISOString()).slice(0, 10),
  );
  const [time, setTime] = useState(() => {
    const d = activity ? new Date(activity.started_at) : new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [miles, setMiles] = useState(
    activity?.distance_m != null ? metersToMiles(Number(activity.distance_m)).toFixed(2) : '',
  );
  const [duration, setDuration] = useState(
    activity?.duration_s != null ? formatDuration(activity.duration_s) : '',
  );
  const [avgHr, setAvgHr] = useState(activity?.avg_hr != null ? String(activity.avg_hr) : '');
  const [description, setDescription] = useState(activity?.description ?? '');
  const [privateNote, setPrivateNote] = useState(activity?.private_note ?? '');
  const [shoes, setShoes] = useState<ShoeOption[]>([]);
  const [shoeId, setShoeId] = useState<string | null>(activity?.shoe_id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const sb = await getSupabase();
      const { data } = await sb
        .from('shoes')
        .select('id, brand_model, nickname, is_default')
        .eq('team_member_id', membership.id)
        .eq('retired', false);
      const opts = (
        (data ?? []) as unknown as Array<{
          id: string;
          brand_model: string;
          nickname: string | null;
          is_default: boolean;
        }>
      ).map((s) => ({ id: s.id, label: s.nickname || s.brand_model, is_default: s.is_default }));
      setShoes(opts);
      if (!activity && !shoeId) {
        setShoeId(opts.find((o) => o.is_default)?.id ?? null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setError('');
    const [hh, mm] = time.split(':').map(Number) as [number, number];
    const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
    if (!y || !mo || !d || Number.isNaN(hh) || Number.isNaN(mm)) {
      return setError('Check the date (YYYY-MM-DD) and time (HH:MM).');
    }
    const startedAt = new Date(y, mo - 1, d, hh || 0, mm || 0).toISOString();
    const durationS = duration.trim() ? parseTimeToSeconds(duration) : null;
    if (duration.trim() && durationS == null) {
      return setError('Duration should look like 42:30 or 1:02:15.');
    }
    const distanceM = miles.trim() ? milesToMeters(Number(miles)) : null;
    if (miles.trim() && (!isFinite(Number(miles)) || Number(miles) < 0)) {
      return setError('Distance should be a number of miles.');
    }

    setBusy(true);
    const sb = await getSupabase();
    const payload = {
      team_member_id: membership.id,
      type,
      title: title.trim() || `${ACTIVITY_TYPE_LABELS[type]}`,
      started_at: startedAt,
      distance_m: distanceM,
      duration_s: durationS,
      avg_hr: avgHr.trim() ? Number(avgHr) : null,
      description: description.trim() || null,
      private_note: privateNote.trim() || null,
      shoe_id: type === 'run' ? shoeId : null,
      source: 'manual' as const,
      status: activity?.status === 'pending' ? 'pending' : ('published' as const),
    };
    const { error } = activity
      ? await sb.from('activities').update(payload).eq('id', activity.id)
      : await sb.from('activities').insert(payload);
    setBusy(false);
    if (error) return setError(error.message);
    await onSaved();
  }

  function confirmDelete() {
    if (!activity) return;
    Alert.alert('Delete activity', 'This removes it from the team feed. Sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const sb = await getSupabase();
            const { error } = await sb.from('activities').delete().eq('id', activity.id);
            if (error) return setError(error.message);
            await onSaved();
          })();
        },
      },
    ]);
  }

  return (
    <SubScreen
      visible={visible}
      title={activity ? 'Edit activity' : 'Log activity'}
      onClose={onClose}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={activity ? 'Save changes' : 'Post activity'}
            onPress={() => void save()}
            busy={busy}
          />
          {activity ? (
            <Button label="Delete activity" variant="danger" onPress={confirmDelete} />
          ) : null}
        </View>
      }
    >
      <ErrorText>{error}</ErrorText>

      <Text style={st.label}>Type</Text>
      <View style={st.typeRow}>
        {ACTIVITY_TYPES.map((t) => (
          <Pressable
            key={t}
            onPress={() => setType(t)}
            style={[st.typeChip, type === t && st.typeChipActive]}
          >
            <Text style={[st.typeChipText, type === t && { color: BRAND_COLORS.white }]}>
              {ACTIVITY_TYPE_ICONS[t]} {ACTIVITY_TYPE_LABELS[t]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Input label="Title" placeholder="Morning Run" value={title} onChangeText={setTitle} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Input
            label="Date"
            placeholder="2026-08-18"
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Start time"
            placeholder="06:30"
            value={time}
            onChangeText={setTime}
            autoCapitalize="none"
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Input
            label="Distance (mi)"
            placeholder="8.0"
            value={miles}
            onChangeText={setMiles}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Duration"
            placeholder="56:30"
            value={duration}
            onChangeText={setDuration}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Avg HR"
            placeholder="148"
            value={avgHr}
            onChangeText={setAvgHr}
            keyboardType="number-pad"
          />
        </View>
      </View>

      {type === 'run' && shoes.length ? (
        <>
          <Text style={st.label}>Shoe</Text>
          <View style={st.typeRow}>
            <Pressable
              onPress={() => setShoeId(null)}
              style={[st.typeChip, shoeId === null && st.typeChipActive]}
            >
              <Text style={[st.typeChipText, shoeId === null && { color: BRAND_COLORS.white }]}>
                None
              </Text>
            </Pressable>
            {shoes.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setShoeId(s.id)}
                style={[st.typeChip, shoeId === s.id && st.typeChipActive]}
              >
                <Text style={[st.typeChipText, shoeId === s.id && { color: BRAND_COLORS.white }]}>
                  👟 {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Input
        label="Description (teammates can see this)"
        placeholder="Easy miles on the trails"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={2}
        style={{ minHeight: 60, textAlignVertical: 'top' }}
      />
      <Input
        label="Private note to coach 🔒 (only coaches ever see this)"
        placeholder="Calf felt tight on the last rep"
        value={privateNote}
        onChangeText={setPrivateNote}
        multiline
        numberOfLines={2}
        style={{ minHeight: 60, textAlignVertical: 'top' }}
      />
    </SubScreen>
  );
}

const st = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: GRAY[500],
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GRAY[300],
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: BRAND_COLORS.white,
  },
  typeChipActive: { backgroundColor: BRAND_COLORS.maroon, borderColor: BRAND_COLORS.maroon },
  typeChipText: { fontSize: 13, fontWeight: '600', color: GRAY[600] },
});
