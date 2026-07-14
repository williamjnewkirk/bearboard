import { useAuth, useUser } from '@clerk/clerk-expo';
import { BRAND_COLORS } from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';

const PLACEHOLDER = '#8A8A8A';

/** Athlete/coach profile: name, class year, events. Persisted to `users`. */
export function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const getSupabase = useSupabase();
  const [name, setName] = useState(user?.fullName ?? '');
  const [classYear, setClassYear] = useState('');
  const [events, setEvents] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('users')
      .select('name, class_year, events')
      .eq('id', user?.id ?? '')
      .maybeSingle();
    if (error) setError(error.message);
    if (data) {
      const row = data as { name: string; class_year: string | null; events: string | null };
      setName(row.name ?? '');
      setClassYear(row.class_year ?? '');
      setEvents(row.events ?? '');
    }
    setLoading(false);
  }, [getSupabase, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    const sb = await getSupabase();
    const { error } = await sb.rpc('update_profile', {
      p_name: name,
      p_class_year: classYear,
      p_events: events,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setSaved(true);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={BRAND_COLORS.maroon} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Profile</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholderTextColor={PLACEHOLDER}
      />

      <Text style={styles.label}>Class year</Text>
      <TextInput
        style={styles.input}
        value={classYear}
        onChangeText={setClassYear}
        placeholder="e.g. 2028"
        placeholderTextColor={PLACEHOLDER}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>Events</Text>
      <TextInput
        style={styles.input}
        value={events}
        onChangeText={setEvents}
        placeholder="e.g. 5k / 10k, steeple"
        placeholderTextColor={PLACEHOLDER}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saved ? <Text style={styles.saved}>Saved ✓</Text> : null}

      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={() => void save()}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={BRAND_COLORS.white} />
        ) : (
          <Text style={styles.buttonText}>Save</Text>
        )}
      </Pressable>

      <Pressable onPress={() => void signOut()}>
        <Text style={styles.signOut}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND_COLORS.white, padding: 20 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLORS.white,
  },
  h1: { fontSize: 24, fontWeight: '700', color: BRAND_COLORS.maroon, marginBottom: 12 },
  label: { fontSize: 13, color: '#555', marginTop: 12, marginBottom: 4, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: BRAND_COLORS.white,
    color: '#111111',
  },
  error: { color: BRAND_COLORS.crimson, marginTop: 12 },
  saved: { color: BRAND_COLORS.green, marginTop: 12, fontWeight: '600' },
  button: {
    marginTop: 20,
    backgroundColor: BRAND_COLORS.maroon,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: BRAND_COLORS.white, fontSize: 16, fontWeight: '600' },
  signOut: { color: '#888', textAlign: 'center', marginTop: 20, textDecorationLine: 'underline' },
});
