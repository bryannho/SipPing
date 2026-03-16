import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { HomeStack } from './HomeStack';
import { SendStack } from './SendStack';
import { ActivityStack } from './ActivityStack';
import { MeStack } from './MeStack';
import { colors, fonts } from '../theme';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  HomeTab: { focused: 'home', unfocused: 'home-outline' },
  SendTab: { focused: 'send', unfocused: 'send-outline' },
  ActivityTab: { focused: 'pulse', unfocused: 'pulse-outline' },
  MeTab: { focused: 'person', unfocused: 'person-outline' },
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
        tabBarActiveTintColor: colors.cta,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontFamily: fonts.bodyMedium,
          fontSize: 11,
        },
        tabBarStyle: styles.tabBar,
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="SendTab"
        component={SendStack}
        options={{ title: 'Send' }}
      />
      <Tab.Screen
        name="ActivityTab"
        component={ActivityStack}
        options={{ title: 'Activity' }}
      />
      <Tab.Screen
        name="MeTab"
        component={MeStack}
        options={{ title: 'Me' }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderTopWidth: 0,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(30, 43, 58, 0.1)',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 1,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
});
