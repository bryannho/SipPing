import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
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
          // Default tap — navigate to Pending tab
          if (navigationRef.isReady()) {
            navigationRef.navigate('PendingTab');
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
  return (
    <SafeAreaProvider>
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
