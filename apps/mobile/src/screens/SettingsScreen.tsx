/**
 * Settings & account (PRD §5.12): profile, sync connection + upload mode,
 * per-category notification toggles (grouped by tier, no all-or-nothing
 * switch), event reminder lead, leave team, delete account.
 */
import { useAuth, useUser } from '@clerk/clerk-expo';
import {
  BRAND_COLORS,
  NOTIFICATION_CATEGORY_META,
  notificationEnabled,
  type NotificationPrefs,
  type ReminderLead,
  type UploadMode,
} from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership } from '../lib/team-types';
import { VENDOR_SETUP, getSyncProvider, importDetectedWorkouts } from '../lib/sync';
import { Button, Card, ErrorText, GRAY, Input, Loading, LoadingScreen, Screen, SubScreen } from '../lib/ui';

interface UserSettings {
  name: string;
  class_year: string | null;
  events: string | null;
  title: string | null;
  upload_mode: UploadMode;
  notification_prefs: NotificationPrefs;
  reminder_lead: ReminderLead;
}

export function SettingsScreen({
  membership,
  onChanged,
}: {
  membership: Membership;
  onChanged: () => void;
}) {
  const { user } = useUser();
  const { signOut } = useAuth();
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showSyncSetup, setShowSyncSetup] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  const load = useCallback(async () => {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('users')
      .select('name, class_year, events, title, upload_mode, notification_prefs, reminder_lead')
      .eq('id', user?.id ?? '')
      .maybeSingle();
    if (error) setError(error.message);
    if (data) setSettings(data as unknown as UserSettings);
  }, [getSupabase, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile() {
    if (!settings) return;
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('update_profile', {
      p_name: settings.name,
      p_class_year: settings.class_year,
      p_events: settings.events,
      p_title: settings.title,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function patchUser(patch: Record<string, unknown>) {
    const sb = await getSupabase();
    const { error } = await sb
      .from('users')
      .update(patch)
      .eq('id', user?.id ?? '');
    if (error) setError(error.message);
  }

  async function togglePref(category: string, on: boolean) {
    if (!settings) return;
    const prefs = { ...settings.notification_prefs, [category]: on };
    setSettings({ ...settings, notification_prefs: prefs });
    await patchUser({ notification_prefs: prefs });
  }

  async function syncNow() {
    setSyncStatus('Checking…');
    const provider = getSyncProvider();
    if (!(await provider.isAvailable())) {
      setSyncStatus('');
      setShowSyncSetup(true);
      return;
    }
    const ok = await provider.requestPermissions();
    if (!ok) {
      setSyncStatus('Health permissions denied.');
      return;
    }
    const sb = await getSupabase();
    const workouts = await provider.fetchRecentWorkouts(14);
    const { imported, errors } = await importDetectedWorkouts(sb, membership.id, workouts);
    setSyncStatus(
      errors.length
        ? `Imported ${imported}, errors: ${errors[0]}`
        : `Imported ${imported} workouts ✓`,
    );
  }

  function confirmLeave() {
    Alert.alert('Leave team', `Leave ${membership.team.name}? Your history stays with the team.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const sb = await getSupabase();
            const { error } = await sb.rpc('leave_team', { p_team_id: membership.team.id });
            if (error) return setError(error.message);
            onChanged();
          })();
        },
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your sign-in and personal data (activities, injury history, shoes, debriefs). Team-facing records become “Former member”. No undo.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const sb = await getSupabase();
              const { error } = await sb.rpc('delete_account');
              if (error) return setError(error.message);
              try {
                await user?.delete();
              } catch (e) {
                setError(
                  'Your data was removed, but the sign-in identity needs "Allow users to delete their accounts" enabled in Clerk. ' +
                    (e instanceof Error ? e.message : ''),
                );
                return;
              }
              await signOut();
            })();
          },
        },
      ],
    );
  }

  if (!settings) return <LoadingScreen title="Settings" variant="settings" />;

  return (
    <Screen title="Settings" scroll>
      <ErrorText>{error}</ErrorText>
      {saved ? <Text style={st.saved}>Saved ✓</Text> : null}

      <Text style={st.section}>Profile</Text>
      <Card>
        <Input
          label="Name"
          value={settings.name}
          onChangeText={(v) => setSettings({ ...settings, name: v })}
        />
        {isCoach ? (
          <Input
            label="Title"
            placeholder="Head Coach"
            value={settings.title ?? ''}
            onChangeText={(v) => setSettings({ ...settings, title: v })}
          />
        ) : (
          <>
            <Input
              label="Class year"
              placeholder="2028"
              keyboardType="number-pad"
              value={settings.class_year ?? ''}
              onChangeText={(v) => setSettings({ ...settings, class_year: v })}
            />
            <Input
              label="Events"
              placeholder="5k / 10k, steeple"
              value={settings.events ?? ''}
              onChangeText={(v) => setSettings({ ...settings, events: v })}
            />
          </>
        )}
        <Button label="Save profile" onPress={() => void saveProfile()} busy={busy} />
      </Card>

      {!isCoach ? (
        <>
          <Text style={st.section}>Activity sync</Text>
          <Card>
            <Text style={st.help}>
              Your watch → vendor app → Apple Health → BearBoard. Summary stats sync automatically;
              rep splits come from your results form.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="Sync now" variant="secondary" onPress={() => void syncNow()} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Setup guide"
                  variant="outline"
                  onPress={() => setShowSyncSetup(true)}
                />
              </View>
            </View>
            {syncStatus ? <Text style={st.syncStatus}>{syncStatus}</Text> : null}

            <Text style={[st.label, { marginTop: 14 }]}>Upload mode</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['review', 'auto'] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => {
                    setSettings({ ...settings, upload_mode: m });
                    void patchUser({ upload_mode: m });
                  }}
                  style={[st.modeChip, settings.upload_mode === m && st.modeChipActive]}
                >
                  <Text
                    style={[
                      st.modeText,
                      settings.upload_mode === m && { color: BRAND_COLORS.white },
                    ]}
                  >
                    {m === 'review' ? 'Review first' : 'Auto-upload'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={st.help}>
              Review = synced workouts wait in your tray until you approve them (default).
            </Text>
          </Card>
        </>
      ) : null}

      <Text style={st.section}>Notifications</Text>
      <Card>
        <Text style={st.help}>
          Each category has its own switch — mute what you don’t want without losing workout drops.
          Chats can also be muted per conversation. Quiet hours: 10 PM–6 AM team time.
        </Text>
        {(['Training', 'Racing', 'Communication', 'Logistics', 'Optional nudges'] as const).map(
          (tier) => {
            const cats = NOTIFICATION_CATEGORY_META.filter((m) => m.tier === tier);
            if (!cats.length) return null;
            return (
              <View key={tier} style={{ marginTop: 10 }}>
                <Text style={st.tier}>{tier}</Text>
                {cats.map((meta) => (
                  <View key={meta.category} style={st.prefRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.prefLabel}>{meta.label}</Text>
                      <Text style={st.prefDesc}>{meta.description}</Text>
                    </View>
                    <Switch
                      value={notificationEnabled(settings.notification_prefs, meta.category)}
                      onValueChange={(on) => void togglePref(meta.category, on)}
                      trackColor={{ true: BRAND_COLORS.green }}
                    />
                  </View>
                ))}
              </View>
            );
          },
        )}
        <Text style={[st.label, { marginTop: 12 }]}>Event reminder timing</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(
            [
              ['1h', '1h before'],
              ['morning_of', 'Morning of'],
              ['off', 'Off'],
            ] as const
          ).map(([v, label]) => (
            <Pressable
              key={v}
              onPress={() => {
                setSettings({ ...settings, reminder_lead: v });
                void patchUser({ reminder_lead: v });
              }}
              style={[st.modeChip, settings.reminder_lead === v && st.modeChipActive]}
            >
              <Text
                style={[st.modeText, settings.reminder_lead === v && { color: BRAND_COLORS.white }]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Text style={st.section}>Account</Text>
      <Card>
        {!isCoach ? (
          <Pressable onPress={confirmLeave} style={st.dangerRow}>
            <Text style={st.dangerText}>Leave team</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => void signOut()} style={st.dangerRow}>
          <Text style={{ color: GRAY[600], fontWeight: '600' }}>Sign out</Text>
        </Pressable>
        <Pressable onPress={confirmDelete} style={[st.dangerRow, { borderBottomWidth: 0 }]}>
          <Text style={st.dangerText}>Delete my account…</Text>
        </Pressable>
      </Card>

      <SubScreen
        visible={showSyncSetup}
        title="Connect your watch"
        onClose={() => setShowSyncSetup(false)}
      >
        <Text style={st.help}>
          BearBoard reads workouts from Apple Health (iPhone) / Health Connect (Android). Set your
          watch app to write there once, and every run flows in automatically.
        </Text>
        <Text style={[st.help, { color: BRAND_COLORS.maroon, fontWeight: '600' }]}>
          Note: automatic Health sync needs the BearBoard dev/TestFlight build — in Expo Go, use
          manual entry (Feed → + Log) for now.
        </Text>
        {VENDOR_SETUP.map((v) => (
          <Card key={v.vendor}>
            <Text style={st.vendor}>{v.vendor}</Text>
            {v.steps.map((step, i) => (
              <Text key={i} style={st.step}>
                {v.steps.length > 1 ? `${i + 1}. ` : ''}
                {step}
              </Text>
            ))}
          </Card>
        ))}
      </SubScreen>
    </Screen>
  );
}

const st = StyleSheet.create({
  section: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND_COLORS.forest,
    marginTop: 14,
    marginBottom: 8,
  },
  help: { fontSize: 13, color: GRAY[500], lineHeight: 18 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: GRAY[500],
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  saved: { color: BRAND_COLORS.green, fontWeight: '700', marginBottom: 6 },
  syncStatus: { marginTop: 8, fontSize: 13, color: BRAND_COLORS.green, fontWeight: '600' },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: GRAY[300],
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: BRAND_COLORS.white,
  },
  modeChipActive: { backgroundColor: BRAND_COLORS.maroon, borderColor: BRAND_COLORS.maroon },
  modeText: { fontSize: 13, fontWeight: '700', color: GRAY[600] },
  tier: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND_COLORS.maroon,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRAY[200],
  },
  prefLabel: { fontSize: 14, fontWeight: '600', color: GRAY[900] },
  prefDesc: { fontSize: 12, color: GRAY[400], marginTop: 1 },
  dangerRow: {
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRAY[200],
  },
  dangerText: { color: BRAND_COLORS.crimson, fontWeight: '600' },
  vendor: { fontSize: 15, fontWeight: '800', color: GRAY[900], marginBottom: 6 },
  step: { fontSize: 13, color: GRAY[600], lineHeight: 20 },
});
