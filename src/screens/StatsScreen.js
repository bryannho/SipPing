import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function StatsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trip Stats</Text>
      <Text style={styles.subtitle}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#aaa',
  },
});
