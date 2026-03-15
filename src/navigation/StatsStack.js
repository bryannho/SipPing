import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatsScreen } from '../screens/StatsScreen';
import { DrinkLogScreen } from '../screens/DrinkLogScreen';
import { ScheduleRulesScreen } from '../screens/ScheduleRulesScreen';
import { CreateScheduleRuleScreen } from '../screens/CreateScheduleRuleScreen';
import { AccountScreen } from '../screens/AccountScreen';

const Stack = createNativeStackNavigator();

export function StatsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Stats"
        component={StatsScreen}
        options={{ title: 'Trip Stats' }}
      />
      <Stack.Screen
        name="DrinkLog"
        component={DrinkLogScreen}
        options={({ route }) => ({
          title: route.params?.tripName ? `${route.params.tripName} Log` : 'Drink Log',
        })}
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
      <Stack.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: 'Account' }}
      />
    </Stack.Navigator>
  );
}
