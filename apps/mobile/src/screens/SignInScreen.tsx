import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import { BRAND_COLORS } from '@bearboard/shared';
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

type Mode = 'signIn' | 'signUp';

const PLACEHOLDER = '#8A8A8A';

/**
 * Email/password sign-in and sign-up with email-code verification.
 * OAuth (Apple + native Google ID-token) is added next per the Polyscope
 * convention. Every sign-up sends `legalAccepted: true` or Clerk stalls in
 * `missing_requirements`.
 */
export function SignInScreen() {
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loaded = signInLoaded && signUpLoaded;

  async function handleSignIn() {
    if (!signInLoaded) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await signIn.create({ identifier: email, password });
      if (attempt.status === 'complete') {
        await setSignInActive({ session: attempt.createdSessionId });
      } else {
        setError('Additional verification required.');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp() {
    if (!signUpLoaded) return;
    setBusy(true);
    setError(null);
    try {
      await signUp.create({ emailAddress: email, password, legalAccepted: true });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    if (!signUpLoaded) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code });
      if (attempt.status === 'complete') {
        await setSignUpActive({ session: attempt.createdSessionId });
      } else {
        setError('That code was not accepted.');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>BearBoard</Text>

      {pendingVerification ? (
        <>
          <Text style={styles.subtitle}>Enter the code we emailed you.</Text>
          <TextInput
            style={styles.input}
            placeholder="Verification code"
            placeholderTextColor={PLACEHOLDER}
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
            autoFocus
          />
          <PrimaryButton label="Verify" onPress={handleVerify} busy={busy} />
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={PLACEHOLDER}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={PLACEHOLDER}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <PrimaryButton
            label={mode === 'signIn' ? 'Sign in' : 'Create account'}
            onPress={mode === 'signIn' ? handleSignIn : handleSignUp}
            busy={busy}
          />
          <Pressable
            onPress={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn');
              setError(null);
            }}
          >
            <Text style={styles.link}>
              {mode === 'signIn' ? 'New here? Create an account' : 'Have an account? Sign in'}
            </Text>
          </Pressable>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </KeyboardAvoidingView>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
}) {
  return (
    <Pressable style={styles.button} onPress={onPress} disabled={busy}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'errors' in e) {
    const errs = (e as { errors?: Array<{ message?: string }> }).errors;
    if (errs?.[0]?.message) return errs[0].message;
  }
  return 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: BRAND_COLORS.white,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLORS.white,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    color: BRAND_COLORS.maroon,
  },
  subtitle: { fontSize: 15, color: '#444', textAlign: 'center' },
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
  button: {
    backgroundColor: BRAND_COLORS.maroon,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: BRAND_COLORS.white, fontSize: 16, fontWeight: '600' },
  link: { color: BRAND_COLORS.maroon, textAlign: 'center', marginTop: 4 },
  error: { color: BRAND_COLORS.crimson, textAlign: 'center' },
});
