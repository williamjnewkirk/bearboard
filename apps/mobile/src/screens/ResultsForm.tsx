/**
 * Split submission (PRD §5.5): the assigned rep scheme expands into per-rep
 * time inputs — mm:ss.t keypad, auto-advance, per-rep skip, RPE, comment.
 */
import {
  BRAND_COLORS,
  describeScheme,
  expandScheme,
  formatSplit,
  parseTimeToSeconds,
  splitForRep,
  type RepScheme,
  type Split,
} from '@bearboard/shared';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import { Button, Card, ErrorText, GRAY, Input, SubScreen } from '../lib/ui';

export function ResultsForm({
  visible,
  assignmentId,
  scheme,
  existing,
  workoutLabel,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  assignmentId: string;
  scheme: RepScheme;
  existing: { splits: Split[] | null; rpe: number | null; comment: string | null } | null;
  workoutLabel: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const getSupabase = useSupabase();
  const rows = useMemo(() => expandScheme(scheme), [scheme]);
  const [times, setTimes] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const r of rows) {
      const s = splitForRep(existing?.splits, r.rep);
      if (s?.time_s != null) init[r.rep] = formatSplit(s.time_s);
    }
    return init;
  });
  const [skipped, setSkipped] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    for (const r of rows) {
      if (splitForRep(existing?.splits, r.rep)?.felt_based) init[r.rep] = true;
    }
    return init;
  });
  const [rpe, setRpe] = useState<number | null>(existing?.rpe ?? null);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<Record<number, TextInput | null>>({});

  async function submit() {
    // Validate + build splits payload.
    const splits: Split[] = [];
    for (const r of rows) {
      if (skipped[r.rep]) {
        splits.push({ rep: r.rep, felt_based: true });
        continue;
      }
      const raw = times[r.rep]?.trim();
      if (!raw) continue; // athlete can leave reps blank
      const secs = parseTimeToSeconds(raw);
      if (secs == null) {
        setError(`Rep ${r.rep}: couldn't read "${raw}" — use mm:ss or mm:ss.t`);
        return;
      }
      splits.push({ rep: r.rep, time_s: secs });
    }
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('submit_workout_result', {
      p_assignment_id: assignmentId,
      p_splits: splits,
      p_rpe: rpe,
      p_comment: comment || null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    onSubmitted();
  }

  return (
    <SubScreen
      visible={visible}
      title="Log your splits"
      onClose={onClose}
      footer={
        <Button
          label={busy ? 'Submitting…' : 'Submit results'}
          onPress={() => void submit()}
          busy={busy}
        />
      }
    >
      <Text style={st.workout}>{workoutLabel}</Text>
      {scheme.length ? <Text style={st.scheme}>{describeScheme(scheme)}</Text> : null}

      <Card>
        {rows.map((r, idx) => (
          <View key={r.rep} style={st.repRow}>
            <Text style={st.repLabel} numberOfLines={1}>
              {r.label}
            </Text>
            {skipped[r.rep] ? (
              <Pressable onPress={() => setSkipped((p) => ({ ...p, [r.rep]: false }))}>
                <Text style={st.skippedText}>felt-based ✓</Text>
              </Pressable>
            ) : (
              <TextInput
                ref={(el) => {
                  inputRefs.current[r.rep] = el;
                }}
                style={st.timeInput}
                placeholder="3:12.4"
                placeholderTextColor={GRAY[400]}
                keyboardType="numbers-and-punctuation"
                returnKeyType={idx < rows.length - 1 ? 'next' : 'done'}
                value={times[r.rep] ?? ''}
                onChangeText={(t) => setTimes((p) => ({ ...p, [r.rep]: t }))}
                onSubmitEditing={() => {
                  const next = rows[idx + 1];
                  if (next) inputRefs.current[next.rep]?.focus();
                }}
              />
            )}
            <Pressable
              onPress={() => setSkipped((p) => ({ ...p, [r.rep]: !p[r.rep] }))}
              hitSlop={8}
            >
              <Text style={st.skipBtn}>{skipped[r.rep] ? 'time it' : 'skip'}</Text>
            </Pressable>
          </View>
        ))}
        {rows.length === 0 ? (
          <Text style={{ color: GRAY[500], fontSize: 13 }}>
            No structured reps on this workout — just add RPE and how it went.
          </Text>
        ) : null}
      </Card>

      <Text style={st.rpeLabel}>How hard was it? (RPE 1–10)</Text>
      <View style={st.rpeRow}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
            onPress={() => setRpe(rpe === n ? null : n)}
            style={[st.rpeBtn, rpe === n && st.rpeBtnActive]}
          >
            <Text style={[st.rpeText, rpe === n && { color: BRAND_COLORS.white }]}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <Input
        label="How did it go?"
        placeholder="Legs felt heavy on 4, moved well after…"
        value={comment}
        onChangeText={setComment}
        multiline
        numberOfLines={3}
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />

      <ErrorText>{error}</ErrorText>
    </SubScreen>
  );
}

const st = StyleSheet.create({
  workout: { fontSize: 16, fontWeight: '800', color: BRAND_COLORS.forest },
  scheme: { fontSize: 13, color: GRAY[500], marginTop: 2, marginBottom: 12 },
  repRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRAY[300],
  },
  repLabel: { flex: 1, fontSize: 13, color: GRAY[600] },
  timeInput: {
    width: 90,
    borderWidth: 1,
    borderColor: GRAY[300],
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    color: GRAY[900],
    backgroundColor: BRAND_COLORS.white,
  },
  skippedText: { color: BRAND_COLORS.green, fontWeight: '600', fontSize: 13 },
  skipBtn: { color: GRAY[400], fontSize: 12, textDecorationLine: 'underline' },
  rpeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: GRAY[500],
    marginTop: 6,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rpeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  rpeBtn: {
    width: 30,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GRAY[300],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLORS.white,
  },
  rpeBtnActive: { backgroundColor: BRAND_COLORS.maroon, borderColor: BRAND_COLORS.maroon },
  rpeText: { fontWeight: '700', color: GRAY[600] },
});
