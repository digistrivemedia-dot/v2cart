import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Rubik_600SemiBold, Rubik_700Bold } from '@expo-google-fonts/rubik';
import {
  NunitoSans_400Regular,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from '@expo-google-fonts/nunito-sans';

import { colors } from '../src/theme';
import { useAuthStore } from '../src/store/authStore';
import { useCartStore } from '../src/store/cartStore';
import { useWishlistStore } from '../src/store/wishlistStore';
import { useSettingsStore } from '../src/store/settingsStore';

// Hold the splash until fonts are ready, so text never pops from a fallback
// face to the real one on first paint.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const hydrateCart = useCartStore((s) => s.hydrate);
  const hydrateWishlist = useWishlistStore((s) => s.hydrate);
  const loadSettings = useSettingsStore((s) => s.load);

  const [fontsLoaded, fontError] = useFonts({
    Rubik_600SemiBold,
    Rubik_700Bold,
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
  });

  useEffect(() => {
    // Order matters: the saved basket has to be in the store before the
    // session is restored, because restoring a session merges that basket
    // into the server cart. In parallel, bootstrap could merge an empty one
    // and then be overwritten by the late hydrate.
    Promise.all([hydrateCart(), hydrateWishlist()]).then(bootstrap);
    // The GST rate, needed before any total is shown or charged. Independent
    // of the session — it's a public setting.
    loadSettings();
  }, [bootstrap, hydrateCart, hydrateWishlist, loadSettings]);

  useEffect(() => {
    // Hide on error too: a font that fails to load must not leave the user
    // staring at a splash screen forever.
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
          // Forward navigation slides in from the right; the platform's back
          // gesture reverses it. Consistent direction = legible hierarchy.
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="product/[id]" />
        <Stack.Screen name="checkout" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="order-success" options={{ gestureEnabled: false }} />
        <Stack.Screen name="account/orders" />
        <Stack.Screen name="account/order/[id]" />
        <Stack.Screen name="account/wishlist" />
        <Stack.Screen name="account/addresses" />
        <Stack.Screen name="(auth)/login" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="(auth)/register" />
      </Stack>
    </SafeAreaProvider>
  );
}
