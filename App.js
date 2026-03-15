import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NetworkProvider } from './src/contexts/NetworkContext';
import { AuthProvider, AuthContext } from './src/contexts/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { linking } from './src/navigation/linking';
import {
  registerPushToken,
  setupNotificationListeners,
} from './src/utils/pushNotifications';

function AppContent() {
  const appState = useRef(AppState.currentState);
  const { user } = React.useContext(AuthContext);

  useEffect(() => {
    setupNotificationListeners();
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
  return (
    <SafeAreaProvider>
      <NetworkProvider>
        <AuthProvider>
          <NavigationContainer linking={linking}>
            <AppContent />
          </NavigationContainer>
        </AuthProvider>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}
