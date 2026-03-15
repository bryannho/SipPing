import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatsScreen } from '../screens/StatsScreen';

const Stack = createNativeStackNavigator();

export function StatsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Stats"
        component={StatsScreen}
        options={{ title: 'Trip Stats' }}
      />
    </Stack.Navigator>
  );
}
