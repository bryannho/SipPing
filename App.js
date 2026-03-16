import React, { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import { NetworkProvider } from './src/contexts/NetworkContext';
import { AuthProvider, AuthContext } from './src/contexts/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { linking } from './src/navigation/linking';
import {
  registerPushToken,
  setupNotificationListeners,
  setupNotificationCategories,
  handleNotificationAction,
} from './src/utils/pushNotifications';
import { loadSounds, unloadSounds } from './src/utils/sounds';
import { LoadingScreen } from './src/components/LoadingScreen';

SplashScreen.preventAutoHideAsync();

function AppContent() {
  const appState = useRef(AppState.currentState);
  const { user } = React.useContext(AuthContext);

  useEffect(() => {
    setupNotificationListeners();
    setupNotificationCategories();
    loadSounds();

    return () => {
      unloadSounds();
    };
  }, []);

  // Handle notification tap / action button responses
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const { actionIdentifier } = response;
        const data = response.notification.request.content.data;

        if (
          actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
        ) {
          // Default tap — navigate to Home tab (pending pings are now inline)
          if (navigationRef.isReady()) {
            navigationRef.navigate('HomeTab');
          }
        } else {
          // Action button pressed (ACCEPT, DECLINE, LATER)
          handleNotificationAction(actionIdentifier, data);
        }
      }
    );

    return () => subscription.remove();
  }, []);

  // Re-register push token when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        user
      ) {
        registerPushToken(user.id);
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [user]);

  return (
    <>
      <StatusBar style="auto" />
      <RootNavigator />
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaProvider onLayout={onLayoutRootView}>
      <NetworkProvider>
        <AuthProvider>
          <NavigationContainer ref={navigationRef} linking={linking}>
            <AppContent />
          </NavigationContainer>
        </AuthProvider>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}
