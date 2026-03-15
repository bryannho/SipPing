import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SendScreen } from '../screens/SendScreen';

const Stack = createNativeStackNavigator();

export function SendStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Send"
        component={SendScreen}
        options={{ title: 'Send Ping' }}
      />
    </Stack.Navigator>
  );
}
