import { useAuth, useUser } from '@clerk/clerk-expo';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function HomeScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BearBoard</Text>
      <Text style={styles.subtitle}>
        Signed in as {user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? 'athlete'}.
      </Text>
      <Text style={styles.meta}>Next: enter a join code to land in your team.</Text>
      <Pressable style={styles.button} onPress={() => signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 16 },
  meta: { fontSize: 13, color: '#666', marginBottom: 12 },
  button: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
