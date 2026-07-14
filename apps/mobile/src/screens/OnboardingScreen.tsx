import { useAuth, useUser } from '@clerk/clerk-expo';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSupabase } from '../lib/useSupabase';

type Mode = 'join' | 'create';

/** First-run: join with a code, or create a team (become its coach). */
export function OnboardingScreen({ onJoined }: { onJoined: () => void }) {
  const { user } = useUser();
  const { signOut } = useAuth();
  const getSupabase = useSupabase();

  const [mode, setMode] = useState<Mode>('join');
  const [code, setCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [school, setSchool] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const userName = user?.fullName ?? user?.firstName ?? null;

  async function join() {
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('join_team_with_code', {
      p_code: code,
      p_user_name: userName,
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.includes('INVALID_JOIN_CODE')
          ? 'That code is not valid. Check with your coach.'
          : `Join failed: ${error.message}`,
      );
      return;
    }
    onJoined();
  }

  async function create() {
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('create_team', {
      p_name: teamName,
      p_school: school || null,
      p_user_name: userName,
    });
    setBusy(false);
    if (error) {
      setError(`Create failed: ${error.message}`);
      return;
    }
    onJoined();
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>BearBoard</Text>
      <Text style={styles.subtitle}>
        Welcome{userName ? `, ${userName}` : ''}. Join your team or create one.
      </Text>

      <View style={styles.tabs}>
        <Tab label="Join a team" active={mode === 'join'} onPress={() => setMode('join')} />
        <Tab label="Create a team" active={mode === 'create'} onPress={() => setMode('create')} />
      </View>

      {mode === 'join' ? (
        <>
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="JOIN CODE"
            autoCapitalize="characters"
            autoCorrect={false}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            maxLength={8}
          />
          <PrimaryButton
            label="Join team"
            onPress={join}
            busy={busy}
            disabled={code.trim().length < 6}
          />
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Team name (e.g. WashU XC)"
            value={teamName}
            onChangeText={setTeamName}
          />
          <TextInput
            style={styles.input}
            placeholder="School (optional)"
            value={school}
            onChangeText={setSchool}
          />
          <PrimaryButton
            label="Create team"
            onPress={create}
            busy={busy}
            disabled={teamName.trim().length === 0}
          />
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={() => void signOut()}>
        <Text style={styles.signOut}>Sign out</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  busy: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, (busy || disabled) && styles.buttonDisabled]}
      onPress={() => void onPress()}
      disabled={busy || disabled}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#444', textAlign: 'center', marginBottom: 8 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#1f6feb', borderColor: '#1f6feb' },
  tabText: { fontWeight: '600', color: '#333' },
  tabTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  codeInput: { textAlign: 'center', letterSpacing: 6, fontSize: 20 },
  button: {
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#c0392b', textAlign: 'center' },
  signOut: { color: '#888', textAlign: 'center', marginTop: 16, textDecorationLine: 'underline' },
});
