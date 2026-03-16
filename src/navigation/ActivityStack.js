import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityScreen } from '../screens/ActivityScreen';
import { DrinkLogScreen } from '../screens/DrinkLogScreen';

const Stack = createNativeStackNavigator();

export function ActivityStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Activity"
        component={ActivityScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DrinkLog"
        component={DrinkLogScreen}
        options={({ route }) => ({
          title: route.params?.tripName ? `${route.params.tripName} Log` : 'Drink Log',
        })}
      />
    </Stack.Navigator>
  );
}
