import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PendingScreen } from '../screens/PendingScreen';

const Stack = createNativeStackNavigator();

export function PendingStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Pending"
        component={PendingScreen}
        options={{ title: 'Pending Pings' }}
      />
    </Stack.Navigator>
  );
}
