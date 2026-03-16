import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MeScreen } from '../screens/MeScreen';
import { TripDetailScreen } from '../screens/TripDetailScreen';
import { CreateTripScreen } from '../screens/CreateTripScreen';
import { JoinTripScreen } from '../screens/onboarding/JoinTripScreen';
import { ScheduleRulesScreen } from '../screens/ScheduleRulesScreen';
import { CreateScheduleRuleScreen } from '../screens/CreateScheduleRuleScreen';

const Stack = createNativeStackNavigator();

export function MeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Me"
        component={MeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={({ route }) => ({ title: route.params?.tripName || 'Trip' })}
      />
      <Stack.Screen
        name="CreateTrip"
        component={CreateTripScreen}
        options={{ title: 'Create Trip' }}
      />
      <Stack.Screen
        name="JoinTrip"
        component={JoinTripScreen}
        options={{ title: 'Join Trip' }}
      />
      <Stack.Screen
        name="ScheduleRules"
        component={ScheduleRulesScreen}
        options={{ title: 'Scheduled Pings' }}
      />
      <Stack.Screen
        name="CreateScheduleRule"
        component={CreateScheduleRuleScreen}
        options={({ route }) => ({
          title: route.params?.editRule ? 'Edit Schedule' : 'New Schedule',
        })}
      />
    </Stack.Navigator>
  );
}
