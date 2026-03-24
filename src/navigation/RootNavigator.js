import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { LoadingScreen } from '../components/LoadingScreen';
import { NoConnectionBanner } from '../components/NoConnectionBanner';
import { AuthStack } from './AuthStack';
import { AppTabs } from './AppTabs';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';

export function RootNavigator() {
  const { user, loading, isRecovery } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.container}>
      <NoConnectionBanner />
      {user && isRecovery ? <ResetPasswordScreen /> : user ? <AppTabs /> : <AuthStack />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
