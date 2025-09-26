import '@/polyfills/crypto';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { OfflineCacheProvider } from '@/context/OfflineCacheContext';
import { VerificationHistoryProvider } from '@/context/VerificationHistoryContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <OfflineCacheProvider>
      <VerificationHistoryProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="verify" options={{ title: 'Verify Credential' }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </VerificationHistoryProvider>
    </OfflineCacheProvider>
  );
}
