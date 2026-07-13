import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { DAY_TYPES } from '@bearboard/shared';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bearboard</Text>
      <Text style={styles.subtitle}>Athlete + coach app placeholder.</Text>
      <Text style={styles.meta}>Shared types wired: {DAY_TYPES.length} day types.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 16, marginTop: 8 },
  meta: { fontSize: 13, color: '#666', marginTop: 16 },
});
