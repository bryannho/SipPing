import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { JoinTripScreen } from '../screens/onboarding/JoinTripScreen';
import { CreateTripScreen } from '../screens/CreateTripScreen';
import { TripDetailScreen } from '../screens/TripDetailScreen';

const Stack = createNativeStackNavigator();

export function HomeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="JoinTrip"
        component={JoinTripScreen}
        options={{ title: 'Join Trip' }}
      />
      <Stack.Screen
        name="CreateTrip"
        component={CreateTripScreen}
        options={{ title: 'Create Trip' }}
      />
      <Stack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={({ route }) => ({ title: route.params?.tripName || 'Trip' })}
      />
    </Stack.Navigator>
  );
}
