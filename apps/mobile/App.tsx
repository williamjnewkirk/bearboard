import { ClerkProvider, SignedIn, SignedOut } from '@clerk/clerk-expo';
import { StatusBar } from 'expo-status-bar';
import { tokenCache } from './src/lib/tokenCache';
import { SignInScreen } from './src/screens/SignInScreen';
import { HomeScreen } from './src/screens/HomeScreen';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. See .env.example.');
}

export default function App() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <SignedIn>
        <HomeScreen />
      </SignedIn>
      <SignedOut>
        <SignInScreen />
      </SignedOut>
      <StatusBar style="auto" />
    </ClerkProvider>
  );
}
