/**
 * Shoe tracker (PRD §5.10): add shoes, one default auto-assigned to runs,
 * mileage accrues from assigned activities, retire at threshold with a nudge.
 * Visibility: self + coaches only.
 */
import {
  BRAND_COLORS,
  SHOE_CATEGORIES,
  SHOE_CATEGORY_LABELS,
  type ShoeCategory,
} from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership } from '../lib/team-types';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorText,
  GRAY,
  Input,
  Loading,
  LoadingScreen,
  Screen,
  SubScreen,
} from '../lib/ui';

interface ShoeRow {
  id: string;
  brand_model: string;
  nickname: string | null;
  category: ShoeCategory | null;
  start_miles: number;
  retired: boolean;
  threshold_miles: number | null;
  is_default: boolean;
  current_miles: number;
}

export function ShoesScreen({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const [shoes, setShoes] = useState<ShoeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ShoeRow | 'new' | null>(null);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('shoes')
      .select(
        'id, brand_model, nickname, category, start_miles, retired, threshold_miles, is_default',
      )
      .eq('team_member_id', membership.id)
      .order('retired')
      .order('brand_model');
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as unknown as Array<Omit<ShoeRow, 'current_miles'>>;
    let milesMap: Record<string, number> = {};
    if (list.length) {
      const { data: sm } = await sb
        .from('shoe_mileage')
        .select('shoe_id, current_miles')
        .in(
          'shoe_id',
          list.map((s) => s.id),
        );
      for (const r of (sm ?? []) as Array<{ shoe_id: string; current_miles: number }>) {
        milesMap[r.shoe_id] = Number(r.current_miles);
      }
    }
    setShoes(list.map((s) => ({ ...s, current_miles: milesMap[s.id] ?? Number(s.start_miles) })));
    setLoading(false);
  }, [getSupabase, membership.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function setDefault(shoe: ShoeRow) {
    const sb = await getSupabase();
    await sb
      .from('shoes')
      .update({ is_default: false })
      .eq('team_member_id', membership.id)
      .eq('is_default', true);
    const { error } = await sb.from('shoes').update({ is_default: true }).eq('id', shoe.id);
    if (error) setError(error.message);
    await load();
  }

  async function toggleRetire(shoe: ShoeRow) {
    const sb = await getSupabase();
    const { error } = await sb
      .from('shoes')
      .update({ retired: !shoe.retired, is_default: shoe.retired ? shoe.is_default : false })
      .eq('id', shoe.id);
    if (error) setError(error.message);
    await load();
  }

  if (loading) return <LoadingScreen title="Shoes" subtitle="Only you and your coaches see this" variant="shoes" />;

  const active = shoes.filter((s) => !s.retired);
  const retired = shoes.filter((s) => s.retired);

  return (
    <Screen
      title="Shoes"
      subtitle="Only you and your coaches see this"
      right={<Button small label="+ Add" onPress={() => setEditing('new')} />}
      scroll
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <ErrorText>{error}</ErrorText>

      {shoes.length === 0 ? (
        <EmptyState
          icon="footsteps-outline"
          title="No shoes yet"
          hint="Add your rotation — runs auto-assign to your default pair and mileage adds up on its own."
        />
      ) : null}

      {active.map((s) => {
        const threshold = s.threshold_miles ?? 400;
        const pct = Math.min(1, s.current_miles / threshold);
        const over = s.current_miles >= threshold;
        return (
          <Card key={s.id}>
            <View style={st.rowBetween}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.name} numberOfLines={1}>
                  {s.nickname || s.brand_model}
                </Text>
                <Text style={st.meta}>
                  {s.nickname ? `${s.brand_model} · ` : ''}
                  {s.category ? SHOE_CATEGORY_LABELS[s.category] : 'Shoe'}
                </Text>
              </View>
              {s.is_default ? (
                <Chip color={BRAND_COLORS.green} label="default" />
              ) : (
                <Pressable onPress={() => void setDefault(s)}>
                  <Text style={st.link}>make default</Text>
                </Pressable>
              )}
            </View>
            <View style={st.barTrack}>
              <View
                style={[
                  st.barFill,
                  {
                    width: `${pct * 100}%` as never,
                    backgroundColor: over ? BRAND_COLORS.crimson : BRAND_COLORS.green,
                  },
                ]}
              />
            </View>
            <View style={st.rowBetween}>
              <Text style={[st.miles, over && { color: BRAND_COLORS.crimson }]}>
                {s.current_miles.toFixed(0)} / {threshold} mi
                {over ? ' · time to replace? 👀' : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable onPress={() => setEditing(s)}>
                  <Text style={st.link}>edit</Text>
                </Pressable>
                <Pressable onPress={() => void toggleRetire(s)}>
                  <Text style={[st.link, { color: BRAND_COLORS.crimson }]}>retire</Text>
                </Pressable>
              </View>
            </View>
          </Card>
        );
      })}

      {retired.length ? (
        <>
          <Text style={st.retiredHeader}>Retired</Text>
          {retired.map((s) => (
            <Card key={s.id} style={{ opacity: 0.65 }}>
              <View style={st.rowBetween}>
                <Text style={[st.name, { textDecorationLine: 'line-through' }]}>
                  {s.nickname || s.brand_model}
                </Text>
                <Text style={st.meta}>{s.current_miles.toFixed(0)} mi</Text>
                <Pressable onPress={() => void toggleRetire(s)}>
                  <Text style={st.link}>unretire</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {editing ? (
        <ShoeForm
          visible={Boolean(editing)}
          membership={membership}
          shoe={editing === 'new' ? null : editing}
          firstShoe={shoes.length === 0}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}
    </Screen>
  );
}

function ShoeForm({
  visible,
  membership,
  shoe,
  firstShoe,
  onClose,
  onSaved,
}: {
  visible: boolean;
  membership: Membership;
  shoe: ShoeRow | null;
  firstShoe: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [brandModel, setBrandModel] = useState(shoe?.brand_model ?? '');
  const [nickname, setNickname] = useState(shoe?.nickname ?? '');
  const [category, setCategory] = useState<ShoeCategory | null>(shoe?.category ?? 'trainer');
  const [startMiles, setStartMiles] = useState(shoe ? String(shoe.start_miles) : '0');
  const [threshold, setThreshold] = useState(
    shoe?.threshold_miles != null ? String(shoe.threshold_miles) : '400',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!brandModel.trim()) return setError('Brand / model is required.');
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    const payload = {
      team_member_id: membership.id,
      brand_model: brandModel.trim(),
      nickname: nickname.trim() || null,
      category,
      start_miles: Number(startMiles) || 0,
      threshold_miles: Number(threshold) || 400,
      ...(firstShoe && !shoe ? { is_default: true } : {}),
    };
    const { error } = shoe
      ? await sb.from('shoes').update(payload).eq('id', shoe.id)
      : await sb.from('shoes').insert(payload);
    setBusy(false);
    if (error) return setError(error.message);
    await onSaved();
  }

  return (
    <SubScreen
      visible={visible}
      title={shoe ? 'Edit shoe' : 'Add shoe'}
      onClose={onClose}
      footer={<Button label="Save shoe" onPress={() => void save()} busy={busy} />}
    >
      <ErrorText>{error}</ErrorText>
      <Input
        label="Brand / model"
        placeholder="Nike Pegasus 42"
        value={brandModel}
        onChangeText={setBrandModel}
      />
      <Input
        label="Nickname (optional)"
        placeholder="Daily blues"
        value={nickname}
        onChangeText={setNickname}
      />
      <Text style={st.formLabel}>Category</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {SHOE_CATEGORIES.map((c) => (
          <Pressable
            key={c}
            onPress={() => setCategory(c)}
            style={[st.catChip, category === c && st.catChipActive]}
          >
            <Text style={[st.catChipText, category === c && { color: BRAND_COLORS.white }]}>
              {SHOE_CATEGORY_LABELS[c]}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Input
            label="Starting miles"
            value={startMiles}
            onChangeText={setStartMiles}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Replace at (mi)"
            value={threshold}
            onChangeText={setThreshold}
            keyboardType="number-pad"
          />
        </View>
      </View>
    </SubScreen>
  );
}

const st = StyleSheet.create({
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  name: { fontSize: 15, fontWeight: '800', color: GRAY[900], flexShrink: 1 },
  meta: { fontSize: 12, color: GRAY[500], marginTop: 1 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: GRAY[200], marginVertical: 8 },
  barFill: { height: 6, borderRadius: 3 },
  miles: { fontSize: 13, fontWeight: '600', color: GRAY[600] },
  link: { fontSize: 12, color: BRAND_COLORS.maroon, textDecorationLine: 'underline' },
  retiredHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: GRAY[500],
    marginTop: 10,
    marginBottom: 6,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: GRAY[500],
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  catChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GRAY[300],
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: BRAND_COLORS.white,
  },
  catChipActive: { backgroundColor: BRAND_COLORS.maroon, borderColor: BRAND_COLORS.maroon },
  catChipText: { fontSize: 13, fontWeight: '600', color: GRAY[600] },
});
