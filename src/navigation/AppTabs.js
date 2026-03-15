import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { HomeStack } from './HomeStack';
import { PendingStack } from './PendingStack';
import { SendStack } from './SendStack';
import { StatsStack } from './StatsStack';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  HomeTab: { focused: 'home', unfocused: 'home-outline' },
  PendingTab: { focused: 'time', unfocused: 'time-outline' },
  SendTab: { focused: 'send', unfocused: 'send-outline' },
  StatsTab: { focused: 'bar-chart', unfocused: 'bar-chart-outline' },
};

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons.focused : icons.unfocused;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#4A90D9',
        tabBarInactiveTintColor: '#999',
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="PendingTab"
        component={PendingStack}
        options={{ title: 'Pending' }}
      />
      <Tab.Screen
        name="SendTab"
        component={SendStack}
        options={{ title: 'Send' }}
      />
      <Tab.Screen
        name="StatsTab"
        component={StatsStack}
        options={{ title: 'Stats' }}
      />
    </Tab.Navigator>
  );
}
